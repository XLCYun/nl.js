const { registerHooks } = require('node:module');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { transformSync } = require('@babel/core');
const plugin = require('./dist/vendor/babel');

const runtimeModule = require.resolve('./dist/vendor/core');
// Establish the shared configuration even when the entry/setup has no nl tag.
require(runtimeModule);

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:') || !['commonjs', 'module'].includes(result.format)) return result;
    const filename = fileURLToPath(url);
    if (filename.startsWith(__dirname + path.sep) || filename.split(path.sep).includes('node_modules')) return result;
    if (!['.js', '.cjs', '.mjs'].includes(path.extname(filename))) return result;

    const transformed = transformSync(Buffer.from(result.source).toString(), {
      filename,
      babelrc: false,
      configFile: false,
      sourceType: result.format === 'module' ? 'module' : 'commonjs',
      sourceMaps: 'inline',
      plugins: [[plugin, {
        runtimeModule: result.format === 'module' ? pathToFileURL(runtimeModule).href : runtimeModule,
        runtimeImport: result.format === 'module',
        validateAsyncContext: true,
      }]],
    });
    return { ...result, source: transformed.code };
  },
});
