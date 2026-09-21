const { TypeSafeClient, noul } = require('@typesafe-ai/sdk');
const { Context } = require('./context');
const { debug, debugJson } = require('./log');

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

async function judgeWithJev({ global, scope, source }) {
  try {
    const context = new Context({ global, scope, source });
    const { nlBlock, before, after } = context.extractContext();
    const question = extractQuestion(nlBlock);
    const client = new TypeSafeClient();
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
    debugJson('jev request:', request);
    const response = await client.systemOne(request);

    const answer = response?.answers?.result;
    const probability = answer?.noul;
    if (answer?.type !== 'noul' || !Number.isFinite(probability) ||
        probability < 0 || probability > 1) {
      throw new Error('Jev 返回了无效的 Noul 概率');
    }

    const value = probability > 0.5;
    debug('jev judgment:', { model: response.model, probability, value });
    return value;
  } catch (error) {
    throw new Error(`Jev 判断失败: ${error.message}`, { cause: error });
  }
}

module.exports = { judgeWithJev };
