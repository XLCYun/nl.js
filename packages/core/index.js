const OpenAI = require('openai');
const { Context } = require('./context');
const { Cache } = require('./cache');
const { debug } = require('./log');

const codeCache = new Cache();

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
    debug('prompt:', prompt);

    // 获取响应内容
    const responseContent = completion.choices[0]?.message?.content || '';
    debug('response from LLM', responseContent);
    
    // 解析并返回代码
    const nlCode = parseNlCode(responseContent);
    const code = `(async function () {${nlCode}})()`;
    debug('generated code', code);
    codeCache.set({ code: source.code, start: source.start, end: source.end, value: code });
    return code;
  } catch (error) {
    console.error('OpenAI API 调用失败:', error);
    throw new Error(`代码生成失败: ${error.message}`);
  }
}

module.exports = {
  generate,
  disableCodeCache: () => codeCache.disable()
};

