const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, mkdir, realpath, writeFile, rm } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const cli = path.resolve(__dirname, '../bin/nljs.cjs');

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nljs-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return realpath(directory);
}

async function model(t, asyncFuncBody) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    requests.push({ headers: request.headers, body: parsed });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      id: 'test-completion',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'test-call',
            type: 'function',
            function: {
              name: 'final_output',
              arguments: JSON.stringify({ asyncFuncBody: typeof asyncFuncBody === 'function' ? asyncFuncBody(parsed) : asyncFuncBody }),
            },
          }],
        },
      }],
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    requests,
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
      OPENAI_MODEL: 'test-model',
      NLJS_PROVIDER: 'openai',
    },
  };
}

function run(args, { cwd, env = {}, command = process.execPath, prefix = [cli] } = {}) {
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (/^(OPENAI_|NLJS_|TYPESAFE_)/.test(key)) delete inherited[key];
  }
  delete inherited.DEBUG;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd,
      env: { ...inherited, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('runs a standalone CommonJS script and executes generated code in its scope', async (t) => {
  const cwd = await fixture(t);
  const service = await model(t, 'count += 3; return count * 2;');
  await writeFile(path.join(cwd, 'script.js'), [
    'async function main() {',
    '  let count = 4;',
    '  const result = nl`增加 count，然后返回两倍`; ',
    '  console.log(JSON.stringify({ count, result }));',
    '}',
    'main();',
  ].join('\n'));

  const result = await run(['script.js'], { cwd, env: service.env });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { count: 7, result: 14 });
  assert.match(service.requests[0].body.messages[1].content, /"count":4/);
  assert.match(service.requests[0].body.messages[1].content, /增加 count，然后返回两倍/);
  assert.match(service.requests[0].body.messages[1].content, /console\.log\(JSON\.stringify/);
});

test('runs ESM top-level fragments and fragments in imported local modules', async (t) => {
  const cwd = await fixture(t);
  const service = await model(t, (request) => request.messages[1].content.includes('本地依赖片段')
    ? 'return value + 2;'
    : 'return localResult + 3;');
  await writeFile(path.join(cwd, 'helper.mjs'), 'const value = 5;\nexport const localResult = nl`本地依赖片段`;\n');
  await writeFile(path.join(cwd, 'script.mjs'), [
    "import { localResult } from './helper.mjs';",
    'const result = nl`入口片段`;',
    'console.log(JSON.stringify({ result, main: import.meta.main }));',
  ].join('\n'));

  const result = await run(['script.mjs'], { cwd, env: service.env });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { result: 10, main: true });
});

test('uses only inherited configuration and leaves .env files unloaded', async (t) => {
  const cwd = await fixture(t);
  const service = await model(t, 'return 42;');
  await mkdir(path.join(cwd, 'scripts'));
  await writeFile(path.join(cwd, '.env'), [
    'OPENAI_API_KEY=dotenv-key',
    `OPENAI_BASE_URL=${service.env.OPENAI_BASE_URL}`,
    'OPENAI_MODEL=dotenv-model',
    'NLJS_PROVIDER=openai',
    'NLJS_CWD_FILE_ONLY=from-cwd-file',
  ].join('\n'));
  await writeFile(path.join(cwd, 'scripts/.env'), 'NLJS_SCRIPT_FILE_ONLY=from-script-file');
  await writeFile(path.join(cwd, 'scripts/script.cjs'), [
    'async function main() {',
    '  const result = nl`给出答案`;',
    '  console.log(JSON.stringify({',
    '    result,',
    '    cwdOnly: process.env.NLJS_CWD_FILE_ONLY ?? null,',
    '    scriptOnly: process.env.NLJS_SCRIPT_FILE_ONLY ?? null,',
    '  }));',
    '}',
    'main();',
  ].join('\n'));

  const result = await run(['scripts/script.cjs'], { cwd, env: service.env });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { result: 42, cwdOnly: null, scriptOnly: null });
  assert.equal(service.requests[0].headers.authorization, 'Bearer test-key');
  assert.equal(service.requests[0].body.model, 'test-model');
});

test('describes the command and its version without model configuration', async (t) => {
  const cwd = await fixture(t);
  const help = await run(['--help'], { cwd });
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /Usage: nljs <script> \[args\.\.\.\]/);
  const version = await run(['--version'], { cwd });
  assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), require('../package.json').version);
});

test('reports invalid command arguments and missing scripts with a failing status', async (t) => {
  const cwd = await fixture(t);
  for (const args of [[], ['--unknown'], ['--']]) {
    const result = await run(args, { cwd });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Usage: nljs/);
  }
  const missing = await run(['missing.js'], { cwd });
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /missing\.js/);
});

test('preserves CJS paths, entry status, dependencies and arguments in a directory with spaces', async (t) => {
  const cwd = await fixture(t);
  const directory = path.join(cwd, 'app dir');
  await mkdir(path.join(directory, 'node_modules/ordinary-tag'), { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(directory, '.babelrc'), '{"plugins":["does-not-exist"]}');
  await writeFile(path.join(directory, 'node_modules/ordinary-tag/index.js'), "const nl = () => 'ordinary tag'; module.exports = nl`leave dependency alone`;");
  await writeFile(path.join(directory, 'local.cjs'), 'module.exports = async function () {\n  const count = 7;\n  return nl`局部模块片段`;\n};');
  const script = path.join(directory, '-entry file.cjs');
  await writeFile(script, [
    "const local = require('./local.cjs');",
    "const dependency = require('ordinary-tag');",
    'local().then((result) => console.log(JSON.stringify({',
    '  result, dependency, cwd: process.cwd(), filename: __filename, dirname: __dirname,',
    '  main: require.main === module, argv: process.argv,',
    '})));',
  ].join('\n'));
  const service = await model(t, 'return count + 1;');
  const args = ['a b', '--flag', '=', '', '--'];

  const result = await run(['--', 'app dir/-entry file.cjs', ...args], { cwd, env: service.env });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    result: 8,
    dependency: 'ordinary tag',
    cwd,
    filename: script,
    dirname: directory,
    main: true,
    argv: [process.execPath, script, ...args],
  });
});

test('uses package type to run .js as ESM, including dynamic local imports', async (t) => {
  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(cwd, 'local.js'), 'export const value = 6;');
  await writeFile(path.join(cwd, 'script.js'), [
    "const { value } = await import('./local.js');",
    'const result = nl`模块片段`;',
    'console.log(JSON.stringify({ result, main: import.meta.main, url: import.meta.url }));',
  ].join('\n'));
  const service = await model(t, 'return value * 3;');

  const result = await run(['script.js'], { cwd, env: service.env });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    result: 18,
    main: true,
    url: require('node:url').pathToFileURL(path.join(cwd, 'script.js')).href,
  });
});

test('reports an unsupported synchronous fragment at its original source location', async (t) => {
  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'script.cjs'), 'function main() {\n  nl`这里需要异步函数`;\n}\nmain();');

  const result = await run(['script.cjs'], { cwd });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /script\.cjs/);
  assert.match(result.stderr, /async function/);
  assert.match(result.stderr, /> 2 \|.*nl`这里需要异步函数`/);
});

test('forwards terminal signals to the script so its handler can exit', { skip: process.platform === 'win32' }, async (t) => {
  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'signal.cjs'), [
    "process.on('SIGTERM', () => process.exit(23));",
    'setInterval(() => {}, 1000);',
    "console.log('READY');",
  ].join('\n'));
  const child = spawn(process.execPath, [cli, 'signal.cjs'], {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
  const [ready] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(10000) });
  assert.match(ready.toString(), /READY/);
  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit', { signal: AbortSignal.timeout(10000) });
  assert.equal(signal, null);
  assert.equal(code, 23);
});

test('delivers terminal process-group SIGINT once to the script and its descendants', { skip: process.platform === 'win32' }, async (t) => {
  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'descendant.cjs'), [
    'let count = 0;',
    "process.on('SIGINT', () => { console.log('DESCENDANT_SIGNAL ' + ++count); setTimeout(() => process.exit(0), 120); });",
    'setInterval(() => {}, 1000);',
    "console.log('DESCENDANT_READY ' + process.pid);",
  ].join('\n'));
  await writeFile(path.join(cwd, 'signal.cjs'), [
    "const { spawn } = require('node:child_process');",
    "spawn(process.execPath, ['descendant.cjs'], { stdio: 'inherit' });",
    'let count = 0;',
    "process.on('SIGINT', () => { console.log('SCRIPT_SIGNAL ' + ++count); setTimeout(() => process.exit(0), 200); });",
    "console.log('SCRIPT_READY ' + process.pid);",
  ].join('\n'));
  const child = spawn(process.execPath, [cli, 'signal.cjs'], {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => {
    const pids = [child.pid, ...Array.from(stdout.matchAll(/(?:SCRIPT|DESCENDANT)_READY (\d+)/g), (match) => Number(match[1]))];
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  });
  while (!stdout.includes('SCRIPT_READY') || !stdout.includes('DESCENDANT_READY')) {
    await once(child.stdout, 'data', { signal: AbortSignal.timeout(10000) });
  }
  process.kill(-child.pid, 'SIGINT');
  const [code, signal] = await once(child, 'close', { signal: AbortSignal.timeout(10000) });
  assert.equal(code, 0, stderr);
  assert.equal(signal, null);
  assert.deepEqual(stdout.match(/SCRIPT_SIGNAL \d+/g), ['SCRIPT_SIGNAL 1']);
  assert.deepEqual(stdout.match(/DESCENDANT_SIGNAL \d+/g), ['DESCENDANT_SIGNAL 1']);
});

test('maps execution failures to their source script and fragment locations', async (t) => {
  const cwd = await fixture(t);
  const service = await model(t, (request) => request.messages[1].content.includes('生成代码抛错')
    ? 'throw new Error("generated failure");'
    : 'return 7;');
  for (const extension of ['cjs', 'mjs']) {
    for (const generated of [false, true]) {
      const name = `failure-${generated}.${extension}`;
      await writeFile(path.join(cwd, name), [
        'async function main() {',
        '  const value = 4;',
        `  const result = nl\`${generated ? '生成代码抛错' : '取得片段结果'}\`;`,
        '  throw new Error("script failure");',
        '}',
        'main();',
      ].join('\n'));
      const result = await run([name], { cwd, env: service.env });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, new RegExp(`${name.replace('.', '\\.')}:[${generated ? '3' : '4'}]:\\d+`));
      assert.match(result.stderr, generated ? /generated failure/ : /script failure/);
    }
  }
});

test('preserves script exit codes and signal termination', async (t) => {
  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'exit.cjs'), 'process.exit(17);');
  const result = await run(['exit.cjs'], { cwd });
  assert.equal(result.code, 17);
  if (process.platform !== 'win32') {
    await writeFile(path.join(cwd, 'exit.cjs'), "process.kill(process.pid, 'SIGINT');");
    const terminated = await run(['exit.cjs'], { cwd });
    assert.equal(terminated.code, null);
    assert.equal(terminated.signal, 'SIGINT');
  }
});

test('installs a tarball outside the repository and runs the global nljs bin', async (t) => {
  const directory = await fixture(t);
  const npm = { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [] };
  const packed = await run(['pack', '--json', '--pack-destination', directory], {
    cwd: path.resolve(__dirname, '..'), ...npm,
  });
  assert.equal(packed.code, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  const install = path.join(directory, 'installation');
  const installed = await run(['install', '--global', '--prefix', install, '--no-audit', '--no-fund', path.join(directory, filename)], {
    cwd: directory, ...npm,
  });
  assert.equal(installed.code, 0, installed.stderr);

  const cwd = await fixture(t);
  await writeFile(path.join(cwd, 'script.js'), 'async function main() {\n  let count = 9;\n  const result = nl`独立安装`;\n  console.log(JSON.stringify({ count, result }));\n}\nmain();');
  const service = await model(t, 'count += 1; return count * 2;');
  const bin = path.join(install, process.platform === 'win32' ? 'nljs.cmd' : 'bin/nljs');
  const result = await run(['script.js'], {
    cwd,
    env: { ...service.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` },
    command: bin,
    prefix: [],
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { count: 10, result: 20 });
});
