const OpenAI = require('openai');
const { Context } = require('./context');
const { Cache } = require('./cache');
const { debug } = require('./log');
const { runCodeGeneration } = require('./harness');
const { judgeWithJev } = require('./jev');

const codeCache = new Cache();
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
    const asyncFuncBody = await runCodeGeneration({
      openai,
      model: process.env.OPENAI_MODEL || 'deepseek-v4-pro-0813',
      prompt,
    });
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
