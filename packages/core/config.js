// The property is shared by every module in this JavaScript realm. Leave a
// caller's object intact, and read it again for each new generation/judgment.
if (globalThis.__NLJS_GLOBAL === undefined) globalThis.__NLJS_GLOBAL = {};

function snapshotConfig() {
  if (globalThis.__NLJS_GLOBAL === undefined) globalThis.__NLJS_GLOBAL = {};
  const configuration = globalThis.__NLJS_GLOBAL;
  if (configuration === null || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new Error('__NLJS_GLOBAL 必须是配置对象');
  }
  const {
    provider = 'openai', apiKey, baseURL, model, maxRounds = 10,
    jevThreshold, debug = false, logLevel = 'warn',
  } = configuration;
  if (provider !== 'openai' && provider !== 'jev') {
    throw new Error(`不支持的 __NLJS_GLOBAL.provider: ${provider}，可选值为 openai 或 jev`);
  }
  return {
    provider,
    apiKey,
    baseURL: baseURL === undefined ? (provider === 'jev' ? 'https://api.typesafe.ai' : 'https://api.openai.com/v1') : baseURL,
    model: model === undefined ? (provider === 'jev' ? 'jev-latest' : 'deepseek-v4-pro-0813') : model,
    maxRounds, jevThreshold, debug, logLevel,
  };
}

function validateRequestConfig(config) {
  for (const key of ['apiKey', 'baseURL', 'model']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`__NLJS_GLOBAL.${key} 必须是非空字符串`);
    }
  }
  if (typeof config.debug !== 'boolean') {
    throw new Error('__NLJS_GLOBAL.debug 必须是布尔值');
  }
  if (!['off', 'error', 'warn', 'info', 'debug'].includes(config.logLevel)) {
    throw new Error('__NLJS_GLOBAL.logLevel 必须是 off、error、warn、info 或 debug');
  }
}

module.exports = { snapshotConfig, validateRequestConfig };
