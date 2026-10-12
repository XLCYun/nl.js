const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { generate } = require('../index');

let savedConfig;
let savedFetch;
let requests;

function input(question = '1 > 0', scope = {}) {
  const block = 'nl`' + question + '`';
  const prefix = 'async function main() { const result = ';
  const code = prefix + block + '; }';
  return {
    module: { sourceCode: code },
    scope,
    source: { code, start: prefix.length, end: prefix.length + block.length },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noulResponse(probability) {
  return {
    model: 'jev-1.13.0',
    answers: { result: { type: 'noul', noul: probability } },
    usage: { input_tokens: 20, output_tokens: 5 },
  };
}

function respondWith(responder) {
  globalThis.fetch = async (url, init) => {
    const request = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
    requests.push(request);
    return responder(request);
  };
}

beforeEach(() => {
  savedConfig = globalThis.__NLJS_GLOBAL;
  savedFetch = globalThis.fetch;
  globalThis.__NLJS_GLOBAL = { provider: 'jev', apiKey: 'test-typesafe-key', logLevel: 'off' };
  requests = [];
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  globalThis.__NLJS_GLOBAL = savedConfig;
});

test('Jev uses its own API, model configuration and current source context without an OpenAI key', async () => {
  globalThis.__NLJS_GLOBAL.baseURL = 'https://typesafe.example';
  globalThis.__NLJS_GLOBAL.model = 'jev-1.13.0';
  respondWith(() => jsonResponse(noulResponse(0.99)));
  const params = input('x > 0', { x: 1 });

  const code = await generate(params);
  assert.equal(code, 'true');
  assert.equal(await eval(code), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://typesafe.example/v1/systemone');
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer test-typesafe-key');
  assert.equal(requests[0].body.model, 'jev-1.13.0');
  assert.equal(requests[0].body.state.question, 'x > 0');
  assert.deepEqual(requests[0].body.state.scope, { x: 1 });
  assert.equal(
    requests[0].body.state.context,
    'async function main() { const result = <nl-judge>x > 0</nl-judge>; }'
  );
  assert.equal(requests[0].body.questions.result.type, 'noul');
  assert.ok(requests[0].body.questions.result.instructions.startsWith('x > 0\n\n'));
  assert.match(requests[0].body.questions.result.instructions, /<nl-judge>/);
  assert.match(requests[0].body.questions.result.instructions, /<\/nl-judge>/);
});

test('Jev ignores invalid code generation round limits in the global configuration', async () => {
  respondWith(() => jsonResponse(noulResponse(0.99)));
  for (const maxRounds of [null, 0, 'invalid']) {
    const params = input('当前状态是否合法', { x: 1 });
    globalThis.__NLJS_GLOBAL.maxRounds = maxRounds;
    assert.equal(await generate(params), 'true');
  }
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.url.endsWith('/v1/systemone')));
});

test('Jev receives the nl question directly in its instructions alongside the runtime state', async () => {
  respondWith(() => jsonResponse(noulResponse(0.01)));
  const question = 'Is it legal to place a queen at chessboard[row][column]?';
  const scope = { chessboard: [[1, 0], [0, 0]], row: 1, column: 0 };

  assert.equal(await generate(input(question, scope)), 'false');

  const { state, questions } = requests[0].body;
  assert.equal(state.question, question);
  assert.deepEqual(state.scope, scope);
  assert.ok(state.context.includes('<nl-judge>' + question + '</nl-judge>'));
  assert.ok(questions.result.instructions.startsWith(question + '\n\n'));
  assert.match(questions.result.instructions, /`scope`/);
});

test('the marker identifies the current occurrence when identical nl conditions share a source file', async () => {
  respondWith(() => jsonResponse(noulResponse(0.99)));
  const block = 'nl`x > 0`';
  const prefix = 'async function main() { const first = ' + block + '; const second = ';
  const suffix = '; console.log(first, second); }';
  const code = prefix + block + suffix;

  await generate({
    module: { sourceCode: code },
    scope: { x: 1, first: true },
    source: { code, start: prefix.length, end: prefix.length + block.length },
  });

  assert.equal(requests[0].body.state.question, 'x > 0');
  assert.equal(
    requests[0].body.state.context,
    'async function main() { const first = nl`x > 0`; const second = <nl-judge>x > 0</nl-judge>; console.log(first, second); }'
  );
});

test('condition text preserves multiple lines, escaped backticks and unevaluated interpolations', async () => {
  respondWith(() => jsonResponse(noulResponse(0.99)));
  const question = 'Check \\`label\\`\nand ${value} > 0';

  await generate(input(question, { value: 1 }));

  assert.equal(requests[0].body.state.question, question);
  assert.ok(requests[0].body.state.context.includes('<nl-judge>' + question + '</nl-judge>'));
  assert.ok(requests[0].body.questions.result.instructions.startsWith(question + '\n\n'));
});

test('condition extraction ignores whitespace and comments before the template delimiter', async () => {
  respondWith(() => jsonResponse(noulResponse(0.99)));
  const tags = ['nl ', 'nl /* a ` in a comment */ ', 'nl // another ` in a comment\n'];
  for (const tag of tags) {
    const prefix = 'async function main() { const result = ';
    const block = tag + '`x > 0`';
    const code = prefix + block + '; }';
    await generate({
      module: { sourceCode: code },
      scope: { x: 1 },
      source: { code, start: prefix.length, end: prefix.length + block.length },
    });
    assert.equal(requests.at(-1).body.state.question, 'x > 0');
    assert.equal(
      requests.at(-1).body.state.context,
      'async function main() { const result = <nl-judge>x > 0</nl-judge>; }'
    );
  }
});

test('Jev returns the model judgment and applies the threshold, including false and exactly 0.5', async () => {
  const probabilities = [0, 0.49, 0.5, 0.51, 1];
  const expected = [false, false, false, true, true];
  respondWith(() => jsonResponse(noulResponse(probabilities[requests.length - 1])));

  for (const value of expected) {
    // Even though 1 > 0 is true in JavaScript, the adapter must consume the model's answer.
    const code = await generate(input());
    assert.equal(await eval(code), value);
  }
  assert.equal(requests.length, probabilities.length);
  assert.equal(requests[0].body.model, 'jev-latest');
});

test('a configured Jev threshold rejects 0.51 and includes exactly 0.8', async () => {
  globalThis.__NLJS_GLOBAL.jevThreshold = 0.8;
  const probabilities = [0, 0.51, 0.7999, 0.8, 0.81, 1];
  const expected = [false, false, false, true, true, true];
  respondWith(() => jsonResponse(noulResponse(probabilities[requests.length - 1])));

  for (const value of expected) {
    assert.equal(await generate(input()), String(value));
  }
  assert.equal(requests.length, probabilities.length);
});

test('configured thresholds include the endpoints and an explicit 0.5', async () => {
  for (const [threshold, probability, expected] of [
    [0, 0, true],
    [1, 0.9999, false],
    [1, 1, true],
    [0.5, 0.5, true],
    [0.8, 0.8, true],
  ]) {
    globalThis.__NLJS_GLOBAL.jevThreshold = threshold;
    respondWith(() => jsonResponse(noulResponse(probability)));
    assert.equal(await generate(input()), String(expected));
  }
});

test('Jev reads threshold changes on each judgment', async () => {
  respondWith(() => jsonResponse(noulResponse(0.8)));
  globalThis.__NLJS_GLOBAL.jevThreshold = 0.9;
  assert.equal(await generate(input()), 'false');
  globalThis.__NLJS_GLOBAL.jevThreshold = 0.8;
  assert.equal(await generate(input()), 'true');
  delete globalThis.__NLJS_GLOBAL.jevThreshold;
  assert.equal(await generate(input()), 'true');
  assert.equal(requests.length, 3);
});

test('invalid Jev thresholds fail before any model request', async () => {
  respondWith(() => jsonResponse(noulResponse(1)));
  for (const threshold of [null, NaN, Infinity, -Infinity, -0.1, 1.1, '', '   ', 'abc', '0.8', ' 0.8 ', '0.8extra', '80%', 'NaN', 'Infinity', '-0.1', '1.1', true, {}, []]) {
    globalThis.__NLJS_GLOBAL.jevThreshold = threshold;
    await assert.rejects(generate(input()), /Jev 判断失败: __NLJS_GLOBAL\.jevThreshold/);
  }
  assert.equal(requests.length, 0);
});

test('the same source location is reevaluated when its scope changes', async () => {
  respondWith((request) => jsonResponse(noulResponse(request.body.state.scope.x > 0 ? 0.99 : 0.01)));

  assert.equal(await eval(await generate(input('x > 0', { x: 1 }))), true);
  assert.equal(await eval(await generate(input('x > 0', { x: -1 }))), false);
  assert.equal(requests.length, 2);
});

test('OpenAI stays the default and its cached code cannot bypass an explicit switch to Jev', async () => {
  delete globalThis.__NLJS_GLOBAL.provider;
  globalThis.__NLJS_GLOBAL.jevThreshold = 'invalid-but-unused-by-openai';
  globalThis.__NLJS_GLOBAL.apiKey = 'test-openai-key';
  globalThis.__NLJS_GLOBAL.baseURL = 'https://openai.example/v1';
  globalThis.__NLJS_GLOBAL.model = 'test-code-model';
  respondWith((request) => jsonResponse(request.url.endsWith('/systemone')
    ? noulResponse(0.01)
    : {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_final_output',
            type: 'function',
            function: {
              name: 'final_output',
              arguments: JSON.stringify({ asyncFuncBody: 'return 42;' }),
            },
          }],
        },
      }],
    }));
  const params = input('return 42');

  assert.equal(await eval(await generate(params)), 42);
  assert.equal(await eval(await generate(params)), 42);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://openai.example/v1/chat/completions');
  assert.equal(requests[0].body.model, 'test-code-model');

  globalThis.__NLJS_GLOBAL.provider = 'jev';
  globalThis.__NLJS_GLOBAL.jevThreshold = 0.8;
  assert.equal(await eval(await generate(params)), false);
  assert.equal(requests.length, 2);

  globalThis.__NLJS_GLOBAL.provider = 'openai';
  assert.equal(await eval(await generate(params)), 42);
  assert.equal(requests.length, 2);
});

test('missing, malformed or out-of-range Noul answers fail instead of becoming false', async () => {
  const invalidBodies = [
    null,
    {},
    { answers: { result: { type: 'choice', noul: 1 } } },
    ...[undefined, null, '0.9', -0.01, 1.01].map(noulResponse),
  ];
  for (const body of invalidBodies) {
    respondWith(() => jsonResponse(body));
    await assert.rejects(generate(input()), /Jev 判断失败: Jev 返回了无效的 Noul 概率/);
  }
});

test('a missing TypeSafe key fails before any request', async () => {
  delete globalThis.__NLJS_GLOBAL.apiKey;
  respondWith(() => jsonResponse(noulResponse(1)));
  await assert.rejects(generate(input()), /Jev 判断失败:.*__NLJS_GLOBAL\.apiKey/);
  assert.equal(requests.length, 0);
});

test('authentication failures propagate with the SDK error as their cause', async () => {
  respondWith(() => jsonResponse({ error: { message: 'Invalid API key' } }, 401));
  await assert.rejects(generate(input()), (error) => {
    assert.match(error.message, /Jev 判断失败/);
    assert.equal(error.cause.status, 401);
    return true;
  });
  assert.equal(requests.length, 1);
});

test('an unknown provider fails instead of silently selecting another model or cached code', async () => {
  globalThis.__NLJS_GLOBAL.provider = 'jevv';
  respondWith(() => jsonResponse(noulResponse(1)));
  await assert.rejects(generate(input('return 42')), /不支持的 __NLJS_GLOBAL\.provider: jevv/);
  assert.equal(requests.length, 0);
});
