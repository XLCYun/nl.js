const { TypeSafeClient, noul } = require('@typesafe-ai/sdk');
const { Context } = require('./context');
const { validateRequestConfig } = require('./config');

function extractQuestion(nlBlock) {
  // Locate the opening template delimiter, skipping comments between nl and the template.
  if (nlBlock.endsWith('`')) {
    for (const token of nlBlock.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n\u2028\u2029]*|`/g)) {
      if (token[0] === '`') {
        return nlBlock.slice(token.index + 1, -1);
      }
    }
  }
  throw new Error('无法提取 nl 模板中的判断条件');
}

async function judgeWithJev({ module, scope, source, config, logger }) {
  try {
    const configuredThreshold = config.jevThreshold;
    const inclusive = configuredThreshold !== undefined;
    const threshold = inclusive ? configuredThreshold : 0.5;
    if (!Number.isFinite(threshold) ||
        threshold < 0 || threshold > 1) {
      throw new Error('__NLJS_GLOBAL.jevThreshold 必须是 0 到 1 之间的数值（含端点）');
    }
    validateRequestConfig(config);

    const context = new Context({ module, scope, source });
    const { nlBlock, before, after } = context.extractContext();
    const question = extractQuestion(nlBlock);
    const client = new TypeSafeClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.model,
      logLevel: config.logLevel,
    });
    const request = {
      model: client.defaultModel,
      state: {
        question,
        scope,
        context: `${before}<nl-judge>${question}</nl-judge>${after}`,
      },
      questions: {
        result: noul(
          `${question}\n\n` +
          'Evaluate the question or condition above using the current runtime values in `scope`. ' +
          'The <nl-judge> and </nl-judge> tags in `context` mark its location in the program. ' +
          'Use the surrounding source code to interpret the question; the values in `scope` are authoritative.'
        ),
      },
    };
    logger.debugJson('jev request:', request);
    const response = await client.systemOne(request);

    const answer = response?.answers?.result;
    const probability = answer?.noul;
    if (answer?.type !== 'noul' || !Number.isFinite(probability) ||
        probability < 0 || probability > 1) {
      throw new Error('Jev 返回了无效的 Noul 概率');
    }

    // Preserve the original strict cutoff when no threshold is configured.
    const value = inclusive ? probability >= threshold : probability > threshold;
    logger.debug('jev judgment:', {
      model: response.model,
      probability,
      threshold,
      comparison: inclusive ? '>=' : '>',
      value,
    });
    return value;
  } catch (error) {
    throw new Error(`Jev 判断失败: ${error.message}`, { cause: error });
  }
}

module.exports = { judgeWithJev };
