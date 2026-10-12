#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const usage = `Usage: nljs <script> [args...]

Run JavaScript containing nl\`\` fragments without Babel configuration.
Uses inherited environment variables; does not load .env files.
Requires Node.js 24 or later. CommonJS fragments belong in async functions.

Options:
  --help, -h     Show this help
  --version, -v  Show the CLI version
  --            End CLI options (allows script names starting with -)
`;
const input = process.argv.slice(2);
if (input[0] === '--help' || input[0] === '-h') {
  console.log(usage);
  process.exit(0);
}
if (input[0] === '--version' || input[0] === '-v') {
  console.log(require('../package.json').version);
  process.exit(0);
}
if (input[0] === '--') {
  input.shift();
} else if (input[0]?.startsWith('-')) {
  console.error(`nljs: Unknown option ${input[0]}\n${usage}`);
  process.exit(1);
}
if (!input[0]) {
  console.error(`nljs: A script path is required.\n${usage}`);
  process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('nljs: Node.js 24 or later is required.');
  process.exit(1);
}

const [script, ...args] = input;
const nodeArgs = [
  '--enable-source-maps',
  '--import', pathToFileURL(path.join(__dirname, '../register.cjs')).href,
  path.resolve(script),
  ...args,
];
// Replace this launcher on POSIX so the script keeps the foreground process
// group, terminal, and native signals without a second recipient forwarding them.
if (process.platform !== 'win32' && process.platform !== 'os400') {
  process.execve(process.execPath, [process.execPath, ...nodeArgs], process.env);
}

// execve is unavailable on Windows and IBM i.
const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' });
const forwards = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => {
  const handler = () => child.kill(signal);
  process.on(signal, handler);
  return [signal, handler];
}));
function removeSignalHandlers() {
  for (const [signal, handler] of forwards) process.off(signal, handler);
}
child.on('error', (error) => {
  removeSignalHandlers();
  console.error(`nljs: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  removeSignalHandlers();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code;
});
