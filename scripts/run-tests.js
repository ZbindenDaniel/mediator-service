const fs = require('fs');
const path = require('path');
const { runSuite, rootSuite } = require('../test/harness');

require.extensions['.ts'] = function registerTs(module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  module._compile(content, filename);
};

function collectTests(dir, matches) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(full, matches);
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      matches.push(full);
    }
  }
}

async function main() {
  const roots = [path.join(__dirname, '..', 'v2', 'backend'), path.join(__dirname, '..', 'test')];
  const files = [];
  for (const root of roots) {
    collectTests(root, files);
  }
  files.sort();
  for (const file of files) {
    console.log(`[run-tests] loading ${path.relative(process.cwd(), file)}`);
    require(file);
  }
  await runSuite(rootSuite);
}

main().catch((err) => {
  console.error('[run-tests] Test run failed', err);
  process.exit(1);
});
