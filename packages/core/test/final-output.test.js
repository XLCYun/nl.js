const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { generate } = require('../index');

const envNames = ['NLJS_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'];
let savedEnv;
let savedFetch;
let savedConsoleError;
let requests;
let inputId = 0;

function input(question = '返回 a + b', scope = {}) {
  const block = 'nl`' + question + '`';
  const prefix = 'async function main() { const result = ';
  // Each case has its own source location; repeated calls within a case share it.
  const code = prefix + block + '; }\n// test input ' + ++inputId;
  return {
    global: { sourceCode: code },
    scope,
    source: { code, start: prefix.length, end: prefix.length + block.length },
  };
}

function finalOutputCall(asyncFuncBody) {
  return {
    id: 'call_final_output',
    type: 'function',
    function: {
      name: 'final_output',
      arguments: JSON.stringify({ asyncFuncBody }),
    },
  };
}

function completion(toolCalls, finishReason = 'tool_calls', message = {}) {
  return {
    choices: [{
      finish_reason: finishReason,
      message: { role: 'assistant', content: null, tool_calls: toolCalls, ...message },
    }],
  };
}

function withArguments(value) {
  const call = finalOutputCall('return 42;');
  call.function.arguments = value;
  return completion([call]);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function respondWith(responder) {
  globalThis.fetch = async (url, init) => {
    const request = { url: String(url), body: JSON.parse(init.body) };
    requests.push(request);
    return responder(request);
  };
}

beforeEach(() => {
  savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  savedFetch = globalThis.fetch;
  savedConsoleError = console.error;
  process.env.NLJS_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_BASE_URL = 'https://openai.example/v1';
  process.env.OPENAI_MODEL = 'test-code-model';
  requests = [];
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  console.error = savedConsoleError;
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

test('requests one final_output tool with flat arguments and consumes the first response', async () => {
  respondWith(() => jsonResponse(completion([finalOutputCall('return 7;')])));
  const params = input('返回 a + b', { a: 2, b: 5 });

  assert.equal(await eval(await generate(params)), 7);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://openai.example/v1/chat/completions');
  const request = requests[0].body;
  assert.equal(request.model, 'test-code-model');
  assert.equal(request.temperature, 0);
  assert.deepEqual(request.tool_choice, {
    type: 'function', function: { name: 'final_output' },
  });
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(request.tools.length, 1);
  assert.equal(request.tools[0].type, 'function');
  const tool = request.tools[0].function;
  assert.equal(tool.name, 'final_output');
  assert.equal(Object.hasOwn(tool, 'strict'), false);
  assert.equal(tool.parameters.type, 'object');
  assert.deepEqual(Object.keys(tool.parameters.properties), ['asyncFuncBody']);
  assert.equal(tool.parameters.properties.asyncFuncBody.type, 'string');
  assert.deepEqual(tool.parameters.required, ['asyncFuncBody']);
  assert.equal(tool.parameters.additionalProperties, false);

  assert.deepEqual(request.messages.map((message) => message.role), ['system', 'user']);
  assert.match(request.messages[0].content, /final_output/);
  const prompt = request.messages[1].content;
  assert.ok(prompt.includes('nl`返回 a + b`'));
  assert.ok(prompt.includes(JSON.stringify(params.scope)));
  assert.ok(prompt.includes('/* __NLJS_ASYNC_FUNC_BODY__ */'));
  assert.ok(prompt.includes(params.source.code.slice(params.source.end)));
  assert.match(prompt, /final_output/);
  assert.match(prompt, /asyncFuncBody/);
  assert.match(prompt, /return/);
  assert.match(prompt, /await/);
  assert.doesNotMatch(prompt, /<nl>/);
});

test('submitted bodies retain await and caller variable access when their code is cached', async () => {
  let a = 1;
  const b = 2;
  let counter = 0;
  respondWith(() => jsonResponse(completion([
    finalOutputCall('await Promise.resolve(); counter += 1; return a + b;'),
  ])));
  const params = input('计数加一，再返回 a + b', { a, b, counter });

  const code = await generate(params);
  assert.equal(counter, 0, 'generation must not execute the body');
  assert.equal(await eval(code), 3);
  assert.equal(counter, 1);

  a = 10;
  params.scope = { a, b, counter };
  assert.equal(await generate(params), code);
  assert.equal(await eval(code), 12);
  assert.equal(counter, 2);
  assert.equal(requests.length, 1);
});

test('normal response text is ignored when a valid final_output is present', async () => {
  respondWith(() => jsonResponse(completion(
    [finalOutputCall('return false;')],
    'tool_calls',
    { content: '<nl>throw new Error("text must not execute");</nl>' }
  )));

  assert.equal(await eval(await generate(input())), false);
  assert.equal(requests.length, 1);
});

test('JSON escaping, XML literals and a trailing line comment survive submission', async () => {
  const value = '中文 "quotes"\n`backticks` <nl>kept</nl> \\';
  const body = 'return ' + JSON.stringify(value) + '; // final comment';
  respondWith(() => jsonResponse(completion([finalOutputCall(body)])));

  const code = await generate(input());
  assert.ok(code.includes(body));
  assert.equal(await eval(code), value);
});

test('an explicitly submitted empty or whitespace body is a valid no-op', async () => {
  for (const body of ['', '  \n\t']) {
    respondWith(() => jsonResponse(completion([finalOutputCall(body)])));
    const params = input();
    const code = await generate(params);
    assert.equal(await eval(code), undefined);
    assert.equal(await generate(params), code);
  }
  assert.equal(requests.length, 2);
});

const validCall = finalOutputCall('return 42;');
const invalidResponses = [
  ['missing completion', null],
  ['missing choices', {}],
  ['empty choices', { choices: [] }],
  ['missing message', { choices: [{ finish_reason: 'tool_calls' }] }],
  ['text-only legacy XML', completion(undefined, 'stop', { content: '<nl>return 42;</nl>' })],
  ['legacy function_call', completion(undefined, 'function_call', { function_call: validCall.function })],
  ['empty tool_calls', completion([])],
  ['non-array tool_calls', completion(validCall)],
  ['duplicate final_output calls', completion([validCall, validCall])],
  ['an extra tool alongside final_output', completion([validCall, {
    ...validCall, function: { ...validCall.function, name: 'another_tool' },
  }])],
  ['unknown tool', completion([{
    ...validCall, function: { ...validCall.function, name: 'another_tool' },
  }])],
  ['wrong tool type', completion([{ ...validCall, type: 'custom' }])],
  ['null tool call', completion([null])],
  ['missing function', completion([{ type: 'function' }])],
  ['invalid JSON', withArguments('{')],
  ['non-string arguments', withArguments({ asyncFuncBody: 'return 42;' })],
  ['null parameters', withArguments('null')],
  ['array parameters', withArguments('[]')],
  ['scalar parameters', withArguments('42')],
  ['missing asyncFuncBody', withArguments('{}')],
  ['null asyncFuncBody', withArguments('{"asyncFuncBody":null}')],
  ['numeric asyncFuncBody', withArguments('{"asyncFuncBody":42}')],
  ['additional fields', withArguments('{"asyncFuncBody":"return 42;","extra":true}')],
  ['nested output', withArguments('{"output":{"asyncFuncBody":"return 42;"}}')],
  ['truncated response', completion([validCall], 'length')],
  ['filtered response', completion([validCall], 'content_filter')],
  ['non-tool finish reason', completion([validCall], 'stop')],
  ['model refusal', completion([validCall], 'tool_calls', { refusal: 'Cannot comply.' })],
];

for (const [name, body] of invalidResponses) {
  test(`rejects ${name} without repair requests or caching the failure`, async () => {
    respondWith(() => jsonResponse(requests.length === 1
      ? body
      : completion([finalOutputCall('return 42;')])));
    const params = input();

    await assert.rejects(generate(params), (error) => {
      assert.match(error.message, /代码生成失败:.*final_output/);
      assert.ok(error.cause instanceof Error);
      return true;
    });
    assert.equal(requests.length, 1, 'invalid submissions must not start a repair loop');

    const code = await generate(params);
    assert.equal(await eval(code), 42);
    assert.equal(await generate(params), code);
    assert.equal(requests.length, 2, 'only a valid subsequent submission may populate the cache');
  });
}

test('a service rejecting tool calls fails without falling back to a text request', async () => {
  respondWith(() => jsonResponse({
    error: { message: 'tools are not supported', type: 'invalid_request_error' },
  }, 400));

  await assert.rejects(generate(input()), (error) => {
    assert.match(error.message, /代码生成失败/);
    assert.equal(error.cause.status, 400);
    return true;
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.tools[0].function.name, 'final_output');
});
