const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test, beforeEach, afterEach } = require('node:test');
const { generate } = require('../index');
const initializedConfig = globalThis.__NLJS_GLOBAL;

const hostileEnv = {
  NLJS_PROVIDER: 'invalid-env-provider',
  NLJS_JEV_THRESHOLD: '1',
  OPENAI_API_KEY: 'env-openai-key',
  OPENAI_BASE_URL: 'https://env-openai.invalid',
  OPENAI_MODEL: 'env-openai-model',
  OPENAI_ORG_ID: 'env-org',
  OPENAI_PROJECT_ID: 'env-project',
  OPENAI_WEBHOOK_SECRET: 'env-webhook',
  OPENAI_ADMIN_KEY: 'env-admin-key',
  OPENAI_CUSTOM_HEADERS: ': malformed',
  OPENAI_LOG: 'debug',
  TYPESAFE_API_KEY: 'env-typesafe-key',
  TYPESAFE_BASE_URL: 'https://env-typesafe.invalid',
  TYPESAFE_DEFAULT_MODEL: 'env-typesafe-model',
  TYPESAFE_LOG_LEVEL: 'debug',
  DEBUG: 'true',
};
let savedEnv;
let savedConfig;
let savedFetch;
let savedConsole;
let requests;
let logs;
let inputId = 0;

function input() {
  const block = 'nl`return 7`';
  const code = block + `; // config input ${++inputId}`;
  return { module: { sourceCode: code }, scope: { value: 7 }, source: { code, start: 0, end: block.length } };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function finalOutput() {
  return { choices: [{ finish_reason: 'tool_calls', message: {
    role: 'assistant', content: null,
    tool_calls: [{ id: 'call-result', type: 'function', function: {
      name: 'final_output', arguments: JSON.stringify({ asyncFuncBody: 'return 7;' }),
    } }],
  } }] };
}

beforeEach(() => {
  savedConfig = globalThis.__NLJS_GLOBAL;
  savedFetch = globalThis.fetch;
  savedEnv = Object.fromEntries(Object.keys(hostileEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, hostileEnv);
  savedConsole = Object.fromEntries(['debug', 'log', 'info', 'warn', 'error'].map((key) => [key, console[key]]));
  logs = [];
  for (const key of Object.keys(savedConsole)) console[key] = (...args) => logs.push([key, ...args]);
  requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return jsonResponse(finalOutput());
  };
});

afterEach(() => {
  globalThis.__NLJS_GLOBAL = savedConfig;
  globalThis.fetch = savedFetch;
  Object.assign(console, savedConsole);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('importing the runtime initializes an absent global object and preserves a caller-provided object', () => {
  assert.deepEqual(initializedConfig, {});
  const result = execFileSync(process.execPath, ['-e', [
    'const supplied = Object.freeze({ apiKey: "caller-key" });',
    'globalThis.__NLJS_GLOBAL = supplied;',
    `require(${JSON.stringify(require.resolve('../index'))});`,
    'console.log(globalThis.__NLJS_GLOBAL === supplied && __NLJS_GLOBAL === supplied);',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(result.trim(), 'true');
});

test('OpenAI reads the shared configuration on each call and ignores business environment variables', async () => {
  const config = { apiKey: 'object-key', baseURL: 'https://object.example/v1', model: 'object-model' };
  globalThis.__NLJS_GLOBAL = config;
  assert.equal(await eval(await generate(input())), 7);
  assert.equal(globalThis.__NLJS_GLOBAL, config);
  assert.equal(__NLJS_GLOBAL, config);
  assert.equal(requests[0].url, 'https://object.example/v1/chat/completions');
  assert.equal(requests[0].body.model, 'object-model');
  assert.equal(requests[0].headers.get('authorization'), 'Bearer object-key');
  assert.equal(requests[0].headers.get('openai-organization'), null);
  assert.equal(requests[0].headers.get('openai-project'), null);
  assert.doesNotMatch(requests[0].body.messages[1].content, /object-key|__NLJS_GLOBAL/);

  globalThis.__NLJS_GLOBAL = {
    apiKey: 'replacement-key', baseURL: 'https://replacement.example/v1', model: 'replacement-model',
  };
  assert.equal(await eval(await generate(input())), 7);
  assert.equal(requests[1].url, 'https://replacement.example/v1/chat/completions');
  assert.equal(requests[1].body.model, 'replacement-model');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer replacement-key');
  assert.deepEqual(logs, []);
  for (const [key, value] of Object.entries(hostileEnv)) assert.equal(process.env[key], value);
});

test('Jev uses explicit configuration without SDK environment fallback', async () => {
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return jsonResponse({ model: 'jev-response', answers: { result: { type: 'noul', noul: 0.5 } } });
  };
  globalThis.__NLJS_GLOBAL = {
    provider: 'jev', apiKey: 'object-jev-key', baseURL: 'https://object-jev.example',
    model: 'object-jev-model', jevThreshold: 0.5,
  };
  assert.equal(await generate(input()), 'true');
  assert.equal(requests[0].url, 'https://object-jev.example/v1/systemone');
  assert.equal(requests[0].headers.get('authorization'), 'Bearer object-jev-key');
  assert.equal(requests[0].body.model, 'object-jev-model');
  assert.deepEqual(requests[0].body.state.scope, { value: 7 });
  assert.doesNotMatch(JSON.stringify(requests[0].body), /object-jev-key|__NLJS_GLOBAL/);

  globalThis.__NLJS_GLOBAL = {
    provider: 'jev', apiKey: 'replacement-jev-key', baseURL: 'https://replacement-jev.example', model: 'replacement-jev-model',
  };
  assert.equal(await generate(input()), 'false');
  assert.equal(requests[1].url, 'https://replacement-jev.example/v1/systemone');
  assert.equal(requests[1].body.model, 'replacement-jev-model');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer replacement-jev-key');
  assert.deepEqual(logs, []);
});

test('neither provider uses an environment-only API key or accepts values that trigger SDK fallback', async () => {
  for (const provider of ['openai', 'jev']) {
    for (const [key, values] of [
      ['apiKey', [undefined, null, '', '  ', 42]],
      ['baseURL', [null, '', '  ', 42]],
      ['model', [null, '', '  ', 42]],
      ['logLevel', [null, '', 'invalid', 42]],
      ['debug', [null, '', 'true', 1]],
    ]) {
      for (const value of values) {
        globalThis.__NLJS_GLOBAL = {
          provider, apiKey: 'object-key', baseURL: 'https://object.example', model: 'object-model', [key]: value,
        };
        await assert.rejects(generate(input()), new RegExp(`__NLJS_GLOBAL\\.${key}`));
      }
    }
  }
  assert.equal(requests.length, 0);
});

for (const provider of ['openai', 'jev']) {
  for (const field of ['baseURL', 'model']) {
    test(`${provider} requires explicit ${field} even when the environment supplies it`, async () => {
      globalThis.fetch = async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(init.body) });
        return jsonResponse(provider === 'jev'
          ? { model: 'jev-response', answers: { result: { type: 'noul', noul: 0.5 } } }
          : finalOutput());
      };
      for (const omitted of [true, false]) {
        globalThis.__NLJS_GLOBAL = {
          provider, apiKey: 'object-key', baseURL: 'https://object.example', model: 'object-model',
        };
        if (omitted) delete globalThis.__NLJS_GLOBAL[field];
        else globalThis.__NLJS_GLOBAL[field] = undefined;
        await assert.rejects(generate(input()), new RegExp(`__NLJS_GLOBAL\\.${field} 必须是非空字符串`));
        assert.equal(requests.length, 0);
      }
    });
  }
}

test('in-flight calls keep their settings and debugging while later calls observe global changes', async () => {
  for (const provider of ['openai', 'jev']) {
    logs.length = 0;
    requests.length = 0;
    let markStarted;
    let release;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const ready = new Promise((resolve) => { release = resolve; });
    const response = provider === 'jev'
      ? { model: 'jev-response', answers: { result: { type: 'noul', noul: 0.5 } } }
      : finalOutput();
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
      markStarted();
      await ready;
      return jsonResponse(response);
    };
    globalThis.__NLJS_GLOBAL = {
      provider, apiKey: 'first-key', baseURL: 'https://first.example', model: 'first-model',
      jevThreshold: 0.5, debug: true, logLevel: 'off',
    };
    const generation = generate(input());
    await started;
    globalThis.__NLJS_GLOBAL = {
      provider, apiKey: 'second-key', baseURL: 'https://second.example', model: 'second-model',
      jevThreshold: 0.8, debug: false, logLevel: 'off',
    };
    release();
    assert.equal(await eval(await generation), provider === 'jev' ? true : 7);
    assert.ok(requests[0].url.startsWith('https://first.example/'));
    assert.equal(requests[0].headers.get('authorization'), 'Bearer first-key');
    assert.equal(requests[0].body.model, 'first-model');
    assert.ok(logs.some(([, label]) => label === (provider === 'jev' ? 'jev judgment:' : 'generated code')));

    logs.length = 0;
    assert.equal(await eval(await generate(input())), provider === 'jev' ? false : 7);
    assert.ok(requests[1].url.startsWith('https://second.example/'));
    assert.equal(requests[1].headers.get('authorization'), 'Bearer second-key');
    assert.equal(requests[1].body.model, 'second-model');
    assert.deepEqual(logs, []);
  }
});

test('SDK logging is controlled by the object logLevel independently of NL.js debugging', async () => {
  for (const provider of ['openai', 'jev']) {
    globalThis.fetch = async () => jsonResponse(provider === 'jev'
      ? { model: 'jev-response', answers: { result: { type: 'noul', noul: 0.5 } } }
      : finalOutput());
    globalThis.__NLJS_GLOBAL = {
      provider, apiKey: 'object-key', baseURL: 'https://object.example', model: 'object-model', logLevel: 'debug', debug: false,
    };
    logs.length = 0;
    await generate(input());
    assert.ok(logs.length > 0, `${provider} debug logging should be enabled explicitly`);
    globalThis.__NLJS_GLOBAL.logLevel = 'off';
    logs.length = 0;
    await generate(input());
    assert.deepEqual(logs, []);
  }
});
