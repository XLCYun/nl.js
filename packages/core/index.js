const OpenAI = require('openai');

/**
 * 从源代码中提取上下文
 * @param {string} code - 源代码
 * @param {number} start - 自然语言块起始位置
 * @param {number} end - 自然语言块结束位置
 * @returns {string} 上下文字符串
 */
function extractContext(code, start, end) {
  // 提取自然语言块的内容
  const nlBlock = code.substring(start, end);
  
  // 提取自然语言块前后的上下文代码
  // 暂时不限制上下文代码的长度
  const contextBefore = code.substring(0, start);
  const contextAfter = code.substring(end, code.length);
  
  return {
    before: contextBefore,
    nlBlock: nlBlock,
    after: contextAfter,
    fullContext: `${contextBefore}${nlBlock}${contextAfter}`,
    maskContext: `${contextBefore}(async function () {<nl></nl>})()${contextAfter}`
  };
}

/**
 * 从响应中解析 <nl></nl> 包裹的代码
 * @param {string} response - API 响应内容
 * @returns {string} 解析出的代码字符串
 */
function parseNlCode(response) {
  // 匹配 <nl></nl> 标签及其内容
  const nlTagRegex = /<nl>([\s\S]*?)<\/nl>/;
  const match = response.match(nlTagRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  return "";
}

/**
 * 生成代码
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
  const { code, start, end } = source;
  
  // 提取上下文
  const context = extractContext(code, start, end);
  
  // 构建提示词
  const prompt = `你是一个代码生成助手。请根据以下上下文代码，生成对应的 JavaScript 代码。

上下文代码：
\`\`\`javascript
${context.maskContext}
\`\`\`

当前的作用域变量及其取值如下：
\`\`\`json
${JSON.stringify(scope)}
\`\`\`

在上下文代码中，<nl></nl> 标签内应该是一段生成的 JavaScript 代码，该代码的功能描述为：
${context.nlBlock}

请根据代码功能描述，以及当前运行时的作用域变量及其取值，生成对应的 JavaScript 代码。

请注意：
1. 根据情况，直接返回 true, false, number, string 等基本类型值是允许的。
2. 生成的代码**必需**用 <nl></nl> 标签包裹起来。
`;

  // console.log('prompt', prompt);

  // 初始化 OpenAI 客户端
  // 注意：需要从环境变量中获取 API Key
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
  });

  try {
    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的 JavaScript 代码生成助手。请根据用户的自然语言描述生成对应的代码。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    // 获取响应内容
    const responseContent = completion.choices[0]?.message?.content || '';
    // console.log('responseContent', responseContent);
    
    // 解析并返回代码
    const nlCode = parseNlCode(responseContent);
    return `(async function () {${nlCode}})()`;
  } catch (error) {
    console.error('OpenAI API 调用失败:', error);
    throw new Error(`代码生成失败: ${error.message}`);
  }
}

module.exports = {
  generate
};

