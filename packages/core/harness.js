const { debugJson } = require('./log');

class SubmissionError extends Error {}

const finalOutputTool = {
  type: 'function',
  function: {
    name: 'final_output',
    description: 'Submit the final JavaScript async function body and finish code generation.',
    parameters: {
      type: 'object',
      properties: {
        asyncFuncBody: {
          type: 'string',
          description: 'Only the async function body, without an outer function wrapper, Markdown fences or XML wrappers. Use return for the result; await is allowed.',
        },
      },
      required: ['asyncFuncBody'],
      additionalProperties: false,
    },
  },
};

/**
 * 校验一轮回复：可修正的提交抛出 SubmissionError，损坏或中断的回复直接失败。
 * @param {object} completion - Chat Completions 响应
 * @param {Set<string>} callIds - 本次代码生成会话已收到的工具调用 ID
 * @returns {string} 提交的异步函数体
 */
function parseFinalOutput(completion, callIds) {
  if (!Array.isArray(completion?.choices) || !completion.choices[0]) {
    throw new Error('final_output 响应缺少有效的 choice');
  }
  const choice = completion.choices[0];
  const message = choice.message;
  if (message?.role !== 'assistant' ||
      (message.content != null && typeof message.content !== 'string') ||
      (message.refusal != null && typeof message.refusal !== 'string') ||
      message.function_call != null) {
    throw new Error('final_output 响应包含无效的 assistant 消息');
  }
  if (message.refusal) {
    throw new Error('模型拒绝通过 final_output 提交代码');
  }
  if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') {
    throw new Error(`final_output 响应未正常结束：${choice.finish_reason}`);
  }

  const toolCalls = message.tool_calls;
  if (toolCalls != null && !Array.isArray(toolCalls)) {
    throw new Error('final_output 响应中的 tool_calls 必须是数组');
  }
  if (choice.finish_reason === 'stop') {
    if (toolCalls?.length) {
      throw new Error('final_output 响应结束原因与工具调用不一致');
    }
    throw new SubmissionError('尚未调用 final_output，请调用该工具，通过 asyncFuncBody 字符串提交一份最终异步函数体');
  }
  if (!toolCalls?.length) {
    throw new Error('final_output 响应缺少完整工具调用');
  }

  for (const call of toolCalls) {
    if (typeof call?.id !== 'string' || !call.id.trim() || callIds.has(call.id)) {
      throw new Error('final_output 响应中的工具调用 ID 必须非空且互不重复');
    }
    callIds.add(call.id);
    if (call.type !== 'function' || typeof call.function?.name !== 'string' ||
        !call.function.name) {
      throw new Error('final_output 响应必须包含完整的 function 工具调用');
    }
    if (typeof call.function.arguments !== 'string') {
      throw new Error('final_output arguments 必须是 JSON 字符串');
    }
  }
  if (toolCalls.length > 1) {
    throw new SubmissionError('同轮收到多个工具调用，本轮不采用任何提交；请仅调用一次 final_output 提交一份最终函数体');
  }

  const toolCall = toolCalls[0];
  if (toolCall.function.name !== 'final_output') {
    throw new SubmissionError('未知工具；当前仅支持 final_output');
  }

  let output;
  try {
    output = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new SubmissionError('final_output arguments 不是有效的 JSON', { cause: error });
  }
  if (output === null || typeof output !== 'object' || Array.isArray(output) ||
      Object.keys(output).length !== 1 || !Object.hasOwn(output, 'asyncFuncBody') ||
      typeof output.asyncFuncBody !== 'string') {
    throw new SubmissionError('final_output 参数必须是仅包含 asyncFuncBody 字符串的对象');
  }

  return output.asyncFuncBody;
}

async function runCodeGeneration({ openai, model, prompt, maxRounds }) {
  const callIds = new Set();
  const messages = [
    {
      role: 'system',
      content: '你是一个专业的 JavaScript 代码生成助手。请根据用户的自然语言描述生成对应的代码，每轮只调用一次 final_output 工具，将异步函数体代码提交到 asyncFuncBody 字段。收到错误反馈后可以修正并重新提交；有效提交后结束代码生成。不要在普通回复正文中提交代码。',
    },
    { role: 'user', content: prompt },
  ];

  for (let round = 1; round <= maxRounds; round += 1) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      tools: [finalOutputTool],
      tool_choice: { type: 'function', function: { name: 'final_output' } },
      parallel_tool_calls: false,
    });
    debugJson('response from LLM', completion);

    const choice = completion?.choices?.[0];
    try {
      return parseFinalOutput(completion, callIds);
    } catch (error) {
      if (!(error instanceof SubmissionError)) throw error;
      if (round === maxRounds) {
        throw new Error(`达到代码生成轮数上限 ${maxRounds}：${error.message}`, { cause: error });
      }
      const toolCalls = choice.message.tool_calls || [];
      const feedback = toolCalls.length
        ? toolCalls.map((call) => ({
          role: 'tool',
          tool_call_id: call.id,
          content: `${error.message}。请修正后重新调用 final_output，提交一份最终异步函数体。`,
        }))
        : [{ role: 'user', content: `${error.message}。` }];
      messages.push(choice.message, ...feedback);
    }
  }
}

module.exports = { runCodeGeneration };
