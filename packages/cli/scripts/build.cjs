const { copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const destination = path.resolve(__dirname, '../dist/vendor');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

// Ship the repository's runtime and plugin sources with this package. Consumers
// install the CLI's npm dependencies without requiring sibling packages.
const sources = {
  core: ['index.js', 'cache.js', 'config.js', 'context.js', 'harness.js', 'jev.js', 'log.js', 'LICENSE'],
  babel: ['index.js', 'helpers/checkProgramVar.js', 'helpers/gatherScopeVars.js', 'LICENSE'],
};
const cliDependencies = require('../package.json').dependencies;
for (const [name, files] of Object.entries(sources)) {
  const source = path.resolve(__dirname, '../../', name);
  const target = path.join(destination, name);
  const metadata = require(path.join(source, 'package.json'));
  for (const [dependency, version] of Object.entries(metadata.dependencies || {})) {
    if (cliDependencies[dependency] !== version) {
      throw new Error(`Update the CLI dependency ${dependency} to match ${metadata.name}: ${version}`);
    }
  }
  for (const file of files) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    copyFileSync(path.join(source, file), path.join(target, file));
  }
  writeFileSync(path.join(target, 'package.json'), JSON.stringify({
    name: metadata.name, version: metadata.version, license: metadata.license,
    type: 'commonjs', main: metadata.main,
  }, null, 2) + '\n');
}
