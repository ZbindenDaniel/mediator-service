const fs = require('fs');
const path = require('path');
let ts;
try {
  ts = require('typescript');
} catch (error) {
  console.warn('[run-tests] `typescript` module not found. Falling back to raw execution for .ts files.');
}
const { runSuite, rootSuite } = require('../test/harness');

function transpile(module, filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    if (ts) {
      const result = ts.transpileModule(content, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
        fileName: filename,
      });
      module._compile(result.outputText, filename);
    } else {
      module._compile(content, filename);
    }
  } catch (error) {
    console.error(`[run-tests] Failed to process ${path.relative(process.cwd(), filename)}`, error);
    throw error;
  }
}

require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

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
  const roots = [path.join(__dirname, '..', 'test')];
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
