const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { generate } = require('../index');

let savedConfig;
let savedFetch;
let savedConsoleError;
let requests;
let inputId = 0;
let callId = 0;

function input(question = '返回 a + b', scope = {}) {
  const block = 'nl`' + question + '`';
  const prefix = 'async function main() { const result = ';
  // Each case has its own source location; repeated calls within a case share it.
  const code = prefix + block + '; }\n// test input ' + ++inputId;
  return {
    module: { sourceCode: code },
    scope,
    source: { code, start: prefix.length, end: prefix.length + block.length },
  };
}

function finalOutputCall(asyncFuncBody, id = `call_final_output_${++callId}`) {
  return {
    id,
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
      message: {
        role: 'assistant', content: null,
        ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
        ...message,
      },
    }],
  };
}

function withArguments(value, id) {
  const call = finalOutputCall('return 42;', id);
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
    const request = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
    requests.push(request);
    return responder(request);
  };
}

beforeEach(() => {
  savedConfig = globalThis.__NLJS_GLOBAL;
  savedFetch = globalThis.fetch;
  savedConsoleError = console.error;
  globalThis.__NLJS_GLOBAL = {
    apiKey: 'test-openai-key', baseURL: 'https://openai.example/v1', model: 'test-code-model',
  };
  requests = [];
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  console.error = savedConsoleError;
  globalThis.__NLJS_GLOBAL = savedConfig;
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

test('a missing final_output keeps the assistant reply and asks for a submission in the next round', async () => {
  const first = completion(undefined, 'stop', {
    content: '<nl>return 999;</nl>',
    reasoning_content: 'Provider-specific context must survive the continuation.',
  });
  respondWith(() => jsonResponse(requests.length === 1
    ? first
    : completion([finalOutputCall('return 7;')])));

  assert.equal(await eval(await generate(input())), 7);
  assert.equal(requests.length, 2);
  const initial = requests[0].body;
  const continued = requests[1].body;
  assert.deepEqual(continued.messages.slice(0, 2), initial.messages);
  assert.deepEqual(continued.messages[2], first.choices[0].message);
  assert.equal(continued.messages[3].role, 'user');
  assert.match(continued.messages[3].content, /final_output/);
  assert.match(continued.messages[3].content, /asyncFuncBody/);
  assert.deepEqual(continued.tool_choice, initial.tool_choice);
  assert.deepEqual(continued.tools, initial.tools);
  assert.equal(continued.parallel_tool_calls, false);
  assert.match(initial.messages[1].content, /每轮/);
  assert.match(initial.messages[1].content, /修正/);
  assert.doesNotMatch(initial.messages[1].content, /最后必须且只能调用一次/);
});

test('invalid JSON is returned to its original tool call so the model can correct the submission', async () => {
  const invalid = withArguments('{');
  invalid.choices[0].message.tool_calls[0].id = 'call_invalid_json';
  invalid.choices[0].message.reasoning_content = 'A provider extension accompanies this tool call.';
  respondWith(() => jsonResponse(requests.length === 1
    ? invalid
    : completion([finalOutputCall('return 8;')])));

  assert.equal(await eval(await generate(input())), 8);
  assert.equal(requests.length, 2);
  const messages = requests[1].body.messages;
  assert.deepEqual(messages[2], invalid.choices[0].message);
  assert.equal(messages[3].role, 'tool');
  assert.equal(messages[3].tool_call_id, 'call_invalid_json');
  assert.match(messages[3].content, /JSON/);
  assert.match(messages[3].content, /final_output/);
});

test('a tool call ID reused in a later round aborts before a duplicate conversation is sent', async () => {
  for (const secondArguments of ['{', '{"asyncFuncBody":"return 7;"}']) {
    const first = withArguments('{');
    first.choices[0].message.tool_calls[0].id = 'call_reused';
    const second = withArguments(secondArguments);
    second.choices[0].message.tool_calls[0].id = 'call_reused';
    const previousRequests = requests.length;
    respondWith(() => jsonResponse([
      first, second, completion([finalOutputCall('return 7;')]),
    ][requests.length - previousRequests - 1]));

    await assert.rejects(generate(input()), /代码生成失败:.*工具调用 ID.*互不重复/);
    assert.equal(requests.length - previousRequests, 2);
    assert.deepEqual(requests.at(-1).body.messages[2], first.choices[0].message);
    for (const request of requests.slice(previousRequests)) {
      const ids = request.body.messages.flatMap((message) => (message.tool_calls || []).map((call) => call.id));
      assert.equal(new Set(ids).size, ids.length);
    }
  }
});

test('invalid argument fields are explained to the model and can be resubmitted', async () => {
  for (const args of [
    'null', '[]', '42', '{}', '{"asyncFuncBody":null}', '{"asyncFuncBody":42}',
    '{"asyncFuncBody":"return 42;","extra":true}', '{"output":{"asyncFuncBody":"return 42;"}}',
  ]) {
    const previousRequests = requests.length;
    const invalid = withArguments(args);
    respondWith(() => jsonResponse(requests.length === previousRequests + 1
      ? invalid
      : completion([finalOutputCall('return 9;')])));

    assert.equal(await eval(await generate(input())), 9);
    assert.equal(requests.length, previousRequests + 2);
    const messages = requests.at(-1).body.messages;
    assert.deepEqual(messages[2], invalid.choices[0].message);
    assert.equal(messages[3].role, 'tool');
    assert.equal(messages[3].tool_call_id, invalid.choices[0].message.tool_calls[0].id);
    assert.match(messages[3].content, /仅包含 asyncFuncBody 字符串/);
  }
});

test('an unknown function tool receives feedback identifying final_output as the available tool', async () => {
  const unknown = finalOutputCall('return 100;');
  unknown.function.name = 'another_tool';
  respondWith(() => jsonResponse(requests.length === 1
    ? completion([unknown])
    : completion([finalOutputCall('return 10;')])));

  assert.equal(await eval(await generate(input())), 10);
  assert.equal(requests.length, 2);
  const messages = requests[1].body.messages;
  assert.deepEqual(messages[2].tool_calls, [unknown]);
  assert.equal(messages[3].role, 'tool');
  assert.equal(messages[3].tool_call_id, unknown.id);
  assert.match(messages[3].content, /未知工具/);
  assert.match(messages[3].content, /仅支持 final_output/);
});

test('multiple complete calls receive individual errors before one unambiguous submission is accepted', async () => {
  for (const secondName of ['final_output', 'another_tool']) {
    const first = finalOutputCall('return 100;');
    const second = { ...finalOutputCall('return 200;'), id: 'call_second' };
    second.function.name = secondName;
    const previousRequests = requests.length;
    respondWith(() => jsonResponse(requests.length === previousRequests + 1
      ? completion([first, second])
      : completion([finalOutputCall('return 11;')])));

    assert.equal(await eval(await generate(input())), 11);
    assert.equal(requests.length, previousRequests + 2);
    const messages = requests.at(-1).body.messages;
    assert.deepEqual(messages[2].tool_calls, [first, second]);
    assert.deepEqual(messages.slice(3).map(({ role, tool_call_id }) => ({ role, tool_call_id })), [
      { role: 'tool', tool_call_id: first.id },
      { role: 'tool', tool_call_id: second.id },
    ]);
    for (const feedback of messages.slice(3)) {
      assert.match(feedback.content, /多个/);
      assert.match(feedback.content, /一份/);
      assert.match(feedback.content, /final_output/);
    }
  }
});

test('the tenth round may complete generation with the accumulated conversation and unchanged tool settings', async () => {
  respondWith(() => jsonResponse(requests.length < 10
    ? completion(undefined, 'stop', { content: `Still working in round ${requests.length}.` })
    : completion([finalOutputCall('return 12;')])));

  assert.equal(await eval(await generate(input())), 12);
  assert.equal(requests.length, 10);
  const first = requests[0].body;
  for (let round = 0; round < requests.length; round += 1) {
    const request = requests[round].body;
    assert.equal(request.messages.length, 2 + 2 * round);
    assert.deepEqual(request.messages.slice(0, 2), first.messages);
    assert.equal(request.model, first.model);
    assert.deepEqual(request.tools, first.tools);
    assert.deepEqual(request.tool_choice, first.tool_choice);
    assert.equal(request.parallel_tool_calls, false);
    assert.equal(Object.hasOwn(request.tools[0].function, 'strict'), false);
  }
  const history = requests[9].body.messages.slice(2);
  for (let round = 0; round < 9; round += 1) {
    assert.equal(history[2 * round].content, `Still working in round ${round + 1}.`);
    assert.equal(history[2 * round + 1].role, 'user');
  }
});

test('ten failed rounds report the last submission error and leave the source eligible for a fresh generation', async () => {
  respondWith(() => jsonResponse(requests.length < 10
    ? completion(undefined, 'stop', { content: 'I have not submitted yet.' })
    : withArguments('{')));
  const params = input();

  await assert.rejects(generate(params), /代码生成失败:.*轮数上限 10.*JSON/);
  assert.equal(requests.length, 10, 'the exhausted session must not make an eleventh request');

  respondWith(() => jsonResponse(completion([finalOutputCall('return 13;')])));
  const code = await generate(params);
  assert.equal(await eval(code), 13);
  assert.equal(requests.length, 11);
  assert.equal(requests[10].body.messages.length, 2, 'a later generation starts a fresh conversation');
  assert.equal(await generate(params), code);
  assert.equal(requests.length, 11);
});

test('ten normal replies without a tool submission stop without consuming response text as code', async () => {
  respondWith(() => jsonResponse(completion([], 'stop', { content: 'return 999;' })));

  await assert.rejects(generate(input()), /代码生成失败:.*轮数上限 10.*尚未调用 final_output/);
  assert.equal(requests.length, 10);
});

test('a configured round limit includes the first request and stops an unfinished generation', async () => {
  respondWith(() => jsonResponse(completion(undefined, 'stop', { content: 'Still preparing.' })));
  for (const maxRounds of [1, 3]) {
    const params = input();
    globalThis.__NLJS_GLOBAL.maxRounds = maxRounds;
    const previousRequests = requests.length;

    await assert.rejects(generate(params), new RegExp(`代码生成失败:.*轮数上限 ${maxRounds}：.*final_output`));
    assert.equal(requests.length - previousRequests, maxRounds);
  }
});

test('invalid round limits fail before a model request without converting their types', async () => {
  respondWith(() => jsonResponse(completion([finalOutputCall('return 14;')])));
  for (const maxRounds of [
    null, 0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
    '2', '', true, false, 2n, {}, [], new Number(2),
  ]) {
    const params = input();
    globalThis.__NLJS_GLOBAL.maxRounds = maxRounds;
    await assert.rejects(generate(params), /__NLJS_GLOBAL\.maxRounds.*正.*安全整数/);
  }
  assert.equal(requests.length, 0);
});

test('omitted or undefined maxRounds preserves the default ten-round generation limit', async () => {
  for (const explicitUndefined of [false, true]) {
    const params = input();
    if (explicitUndefined) globalThis.__NLJS_GLOBAL.maxRounds = undefined;
    else delete globalThis.__NLJS_GLOBAL.maxRounds;
    const previousRequests = requests.length;
    respondWith(() => jsonResponse(requests.length - previousRequests < 10
      ? completion(undefined, 'stop', { content: 'Still preparing.' })
      : completion([finalOutputCall('return 7;')])));

    assert.equal(await eval(await generate(params)), 7);
    assert.equal(requests.length - previousRequests, 10);
  }
});

test('positive safe integer limits accept a valid submission in their first round', async () => {
  respondWith(() => jsonResponse(completion([finalOutputCall('return 14;')])));
  for (const maxRounds of [1, Number.MAX_SAFE_INTEGER]) {
    const params = input();
    globalThis.__NLJS_GLOBAL.maxRounds = maxRounds;
    assert.equal(await eval(await generate(params)), 14);
  }
  assert.equal(requests.length, 2);
});

test('a running generation keeps its configuration and context while the next generation sees changes', async () => {
  const params = input('返回 state.value', { state: { value: 'original' } });
  globalThis.__NLJS_GLOBAL.maxRounds = 2;
  respondWith(() => {
    if (requests.length === 1) {
      globalThis.__NLJS_GLOBAL.maxRounds = 1;
      params.scope.state.value = 'changed';
      globalThis.__NLJS_GLOBAL.model = 'next-code-model';
      globalThis.__NLJS_GLOBAL.baseURL = 'https://next-openai.example/v1';
      globalThis.__NLJS_GLOBAL.apiKey = 'next-key';
      return jsonResponse(completion(undefined, 'stop', { content: 'Preparing the body.' }));
    }
    return jsonResponse(completion([finalOutputCall('return "original";')]));
  });

  assert.equal(await eval(await generate(params)), 'original');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://openai.example/v1/chat/completions');
  assert.equal(requests[1].body.model, 'test-code-model');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer test-openai-key');
  assert.deepEqual(requests[1].body.messages.slice(0, 2), requests[0].body.messages);
  assert.ok(requests[1].body.messages[1].content.includes('"value":"original"'));

  const next = input('再次返回 state.value', params.scope);
  respondWith(() => jsonResponse(completion(undefined, 'stop', { content: 'Not submitted.' })));
  await assert.rejects(generate(next), /轮数上限 1：.*final_output/);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].url, 'https://next-openai.example/v1/chat/completions');
  assert.equal(requests[2].body.model, 'next-code-model');
  assert.equal(requests[2].headers.get('authorization'), 'Bearer next-key');
  assert.equal(requests[2].body.messages.length, 2);
  assert.ok(requests[2].body.messages[1].content.includes('"value":"changed"'));
});

test('a failed generation can be retried with a new limit and its repaired code bypasses invalid configuration when cached', async () => {
  const params = input();
  globalThis.__NLJS_GLOBAL.maxRounds = 1;
  respondWith(() => jsonResponse(completion(undefined, 'stop', { content: 'Not submitted.' })));
  await assert.rejects(generate(params), /轮数上限 1：/);
  assert.equal(requests.length, 1);

  globalThis.__NLJS_GLOBAL.maxRounds = 2;
  respondWith(() => jsonResponse(requests.length === 2
    ? withArguments('{')
    : completion([finalOutputCall('return 15;')])));
  const code = await generate(params);
  assert.equal(await eval(code), 15);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].body.messages.length, 2);

  globalThis.__NLJS_GLOBAL.maxRounds = null;
  assert.equal(await generate(params), code);
  assert.equal(requests.length, 3);
});

test('concurrent generations keep separate round limits, models and conversation histories', { timeout: 2000 }, async () => {
  const first = input('返回 session-A 的结果', { session: 'session-A' });
  const second = input('返回 session-B 的结果', { session: 'session-B' });
  const sessions = { 'session-A': [], 'session-B': [] };
  let releaseFirstReplies;
  const bothStarted = new Promise((resolve) => { releaseFirstReplies = resolve; });
  let started = 0;
  respondWith(async (request) => {
    const session = request.body.messages[1].content.includes('session-A') ? 'session-A' : 'session-B';
    const round = sessions[session].push(request);
    if (round === 1) {
      started += 1;
      if (started === 2) releaseFirstReplies();
      await bothStarted;
    }
    return jsonResponse(session === 'session-B' && round === 3
      ? completion([finalOutputCall('return "session-B";')])
      : completion(undefined, 'stop', { content: `${session} reply ${round}` }));
  });

  globalThis.__NLJS_GLOBAL.maxRounds = 2;
  globalThis.__NLJS_GLOBAL.model = 'first-model';
  const firstGeneration = generate(first);
  globalThis.__NLJS_GLOBAL.maxRounds = 3;
  globalThis.__NLJS_GLOBAL.model = 'second-model';
  const secondGeneration = generate(second);
  globalThis.__NLJS_GLOBAL = { provider: 'jev', maxRounds: 1, model: 'later-model' };
  const [firstResult, secondResult] = await Promise.allSettled([firstGeneration, secondGeneration]);

  assert.equal(firstResult.status, 'rejected');
  assert.match(firstResult.reason.message, /轮数上限 2：/);
  assert.equal(secondResult.status, 'fulfilled');
  assert.equal(await eval(secondResult.value), 'session-B');
  assert.equal(sessions['session-A'].length, 2);
  assert.equal(sessions['session-B'].length, 3);
  for (const [session, expectedModel, other] of [
    ['session-A', 'first-model', 'session-B'],
    ['session-B', 'second-model', 'session-A'],
  ]) {
    for (const [round, request] of sessions[session].entries()) {
      assert.equal(request.body.model, expectedModel);
      assert.equal(request.body.messages.length, 2 + round * 2);
      assert.ok(!JSON.stringify(request.body.messages).includes(other));
      assert.deepEqual(request.body.messages.slice(0, 2), sessions[session][0].body.messages);
      for (let previous = 0; previous < round; previous += 1) {
        assert.equal(request.body.messages[2 + previous * 2].content, `${session} reply ${previous + 1}`);
      }
    }
  }
});

test('separate and concurrent generations may reuse tool call IDs', { timeout: 2000 }, async () => {
  const names = ['sequential-first', 'sequential-second', 'parallel-first', 'parallel-second'];
  const sessions = Object.fromEntries(names.map((name) => [name, []]));
  let releaseFirstReplies;
  const bothStarted = new Promise((resolve) => { releaseFirstReplies = resolve; });
  let started = 0;
  respondWith(async (request) => {
    const name = names.find((name) => request.body.messages[1].content.includes(name));
    const round = sessions[name].push(request);
    if (name.startsWith('parallel') && round === 1) {
      started += 1;
      if (started === 2) releaseFirstReplies();
      await bothStarted;
    }
    return jsonResponse(round === 1
      ? withArguments('{', 'call_shared_invalid')
      : completion([finalOutputCall(`return ${JSON.stringify(name)};`, 'call_shared_final')]));
  });

  for (const name of names.slice(0, 2)) {
    assert.equal(await eval(await generate(input(`返回 ${name}`))), name);
  }
  const generated = await Promise.all(names.slice(2).map((name) => generate(input(`返回 ${name}`))));
  assert.deepEqual(await Promise.all(generated.map((code) => eval(code))), names.slice(2));
  for (const history of Object.values(sessions)) {
    assert.equal(history.length, 2);
    assert.equal(history[0].body.messages.length, 2);
    assert.equal(history[1].body.messages[2].tool_calls[0].id, 'call_shared_invalid');
    assert.equal(history[1].body.messages[3].tool_call_id, 'call_shared_invalid');
  }
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
  ['non-array choices', { choices: { 0: completion([validCall]).choices[0] } }],
  ['missing stopped message', { choices: [{ finish_reason: 'stop' }] }],
  ['incorrect assistant role', completion([validCall], 'tool_calls', { role: 'user' })],
  ['incorrect role without calls', completion(undefined, 'stop', { role: 'user', content: 'Ready.' })],
  ['object content', completion([validCall], 'tool_calls', { content: { text: 'Ready.' } })],
  ['object content without calls', completion(undefined, 'stop', { content: { text: 'Ready.' } })],
  ['non-string refusal field', completion(undefined, 'stop', { refusal: false })],
  ['non-array tool calls on a stopped response', completion({}, 'stop', { content: 'Ready.' })],
  ['legacy function call on a stopped response', completion(undefined, 'stop', { function_call: validCall.function })],
  ['missing call ID', completion([{ ...validCall, id: undefined }])],
  ['empty call ID', completion([{ ...validCall, id: '' }])],
  ['blank call ID', completion([{ ...validCall, id: '  ' }])],
  ['non-string call ID', completion([{ ...validCall, id: 42 }])],
  ['missing tool name', completion([{ ...validCall, function: { arguments: '{}' } }])],
  ['empty tool name', completion([{ ...validCall, function: { name: '', arguments: '{}' } }])],
  ['multiple calls containing damaged arguments', completion([validCall, {
    ...validCall, id: 'call_second', function: { ...validCall.function, arguments: {} },
  }])],

  ['legacy function_call', completion(undefined, 'function_call', { function_call: validCall.function })],
  ['empty tool_calls', completion([])],
  ['non-array tool_calls', completion(validCall)],
  ['duplicate tool call IDs', completion([validCall, validCall])],
  ['an extra tool reusing the same call ID', completion([validCall, {
    ...validCall, function: { ...validCall.function, name: 'another_tool' },
  }])],
  ['wrong tool type', completion([{ ...validCall, type: 'custom' }])],
  ['null tool call', completion([null])],
  ['missing function', completion([{ type: 'function' }])],
  ['non-string arguments', withArguments({ asyncFuncBody: 'return 42;' })],
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
