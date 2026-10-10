const OpenAI = require('openai');
const { Context } = require('./context');
const { Cache } = require('./cache');
const { debug, debugJson } = require('./log');
const { judgeWithJev } = require('./jev');

const codeCache = new Cache();
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
 * 只接受一次完整的 final_output 提交，不从响应正文提取代码。
 * @param {object} completion - Chat Completions 响应
 * @returns {string} 提交的异步函数体
 */
function parseFinalOutput(completion) {
  const choice = completion?.choices?.[0];
  if (choice?.finish_reason !== 'tool_calls') {
    throw new Error('模型响应必须以 final_output 工具调用结束');
  }
  if (choice.message?.refusal) {
    throw new Error('模型拒绝通过 final_output 提交代码');
  }

  const toolCalls = choice.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length !== 1) {
    throw new Error('模型必须且只能调用一次 final_output');
  }

  const toolCall = toolCalls[0];
  if (toolCall?.type !== 'function' || toolCall.function?.name !== 'final_output') {
    throw new Error('模型必须调用 final_output 函数工具');
  }
  if (typeof toolCall.function.arguments !== 'string') {
    throw new Error('final_output arguments 必须是 JSON 字符串');
  }

  let output;
  try {
    output = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new Error('final_output arguments 不是有效的 JSON', { cause: error });
  }
  if (output === null || typeof output !== 'object' || Array.isArray(output) ||
      Object.keys(output).length !== 1 || !Object.hasOwn(output, 'asyncFuncBody') ||
      typeof output.asyncFuncBody !== 'string') {
    throw new Error('final_output 参数必须是仅包含 asyncFuncBody 字符串的对象');
  }

  return output.asyncFuncBody;
}

/**
 * 生成代码，或在 Jev 模式下返回布尔常量表达式
 * @param {Object} params - 参数对象
 * @param {Object} params.global - 全局对象，包含 sourceCode
 * @param {Object} params.scope - 作用域对象，包含变量名和值
 * @param {Object} params.source - 源代码信息
 * @param {string} params.source.code - 源代码
 * @param {number} params.source.start - 自然语言块起始位置
 * @param {number} params.source.end - 自然语言块结束位置
 * @returns {Promise<string>} 生成的代码字符串
 */
async function generate({ global, scope, source }) {
  const provider = process.env.NLJS_PROVIDER || 'openai';
  if (provider === 'jev') {
    // Jev evaluates the current state, so its answers must bypass the code cache.
    const value = await judgeWithJev({ global, scope, source });
    return value ? 'true' : 'false';
  }
  if (provider !== 'openai') {
    throw new Error(`不支持的 NLJS_PROVIDER: ${provider}，可选值为 openai 或 jev`);
  }

  const cachedCode = codeCache.get({ code: source.code, start: source.start, end: source.end });
  if (cachedCode) {
    debug('cached code found', cachedCode);
    return cachedCode;
  }

  const context = new Context({ global, scope, source });
  const prompt = context.getPrompt();

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
  });

  try {
    debug('prompt:', prompt);
    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-v4-pro-0813',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的 JavaScript 代码生成助手。请根据用户的自然语言描述生成对应的代码，最终必须调用 final_output 工具，将异步函数体代码提交到 asyncFuncBody 字段。不要在普通回复正文中提交代码。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0,
      tools: [finalOutputTool],
      tool_choice: { type: 'function', function: { name: 'final_output' } },
      parallel_tool_calls: false,
    });
    debugJson('response from LLM', completion);

    const asyncFuncBody = parseFinalOutput(completion);
    // 保留函数体原文，换行避免末尾的单行注释吞掉函数外壳。
    const code = `(async function () {\n${asyncFuncBody}\n})()`;
    debug('generated code', code);
    codeCache.set({ code: source.code, start: source.start, end: source.end, value: code });
    return code;
  } catch (error) {
    console.error('代码生成失败:', error);
    throw new Error(`代码生成失败: ${error.message}`, { cause: error });
  }
}

module.exports = {
  generate,
  disableCodeCache: () => codeCache.disable()
};
