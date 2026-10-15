const OpenAI = require('openai');
const { Context } = require('./context');
const { Cache } = require('./cache');
const { createLogger } = require('./log');
const { snapshotConfig, validateRequestConfig } = require('./config');
const { runCodeGeneration } = require('./harness');
const { judgeWithJev } = require('./jev');

const codeCache = new Cache();
/**
 * 生成代码，或在 Jev 模式下返回布尔常量表达式
 * @param {Object} params - 参数对象
 * @param {Object} params.module - 当前模块的上下文对象，包含 sourceCode
 * @param {Object} params.scope - 作用域对象，包含变量名和值
 * @param {Object} params.source - 源代码信息
 * @param {string} params.source.code - 源代码
 * @param {number} params.source.start - 自然语言块起始位置
 * @param {number} params.source.end - 自然语言块结束位置
 * @returns {Promise<string>} 生成的代码字符串
 */
async function generate({ module, scope, source }) {
  const config = snapshotConfig();
  const logger = createLogger(config.debug === true);
  if (config.provider === 'jev') {
    // Jev evaluates the current state, so its answers must bypass the code cache.
    const value = await judgeWithJev({ module, scope, source, config, logger });
    return value ? 'true' : 'false';
  }
  const cachedCode = codeCache.get({ code: source.code, start: source.start, end: source.end });
  if (cachedCode) {
    logger.debug('cached code found', cachedCode);
    return cachedCode;
  }

  const { maxRounds } = config;
  if (!Number.isSafeInteger(maxRounds) || maxRounds <= 0) {
    throw new Error('__NLJS_GLOBAL.maxRounds 必须是正的安全整数');
  }
  validateRequestConfig(config);
  const context = new Context({ module, scope, source });
  const prompt = context.getPrompt();

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: null,
    project: null,
    webhookSecret: null,
    logLevel: config.logLevel,
  });

  try {
    logger.debug('prompt:', prompt);
    const asyncFuncBody = await runCodeGeneration({
      openai,
      model: config.model,
      prompt,
      maxRounds,
      logger,
    });
    // 保留函数体原文，换行避免末尾的单行注释吞掉函数外壳。
    const code = `(async function () {\n${asyncFuncBody}\n})()`;
    logger.debug('generated code', code);
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
