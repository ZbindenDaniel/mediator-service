const fs = require('fs');
const path = require('path');
// TODO(agent): Keep the Jest helper exposure obvious so future harness updates remain straightforward.
let ts;
try {
  ts = require('typescript');
} catch (error) {
  console.warn('[run-tests] `typescript` module not found. Falling back to raw execution for .ts files.');
}
let esbuild;
try {
  esbuild = require('esbuild');
} catch (error) {
  console.warn('[run-tests] `esbuild` module not found. TypeScript tests may fail without transpilation.', error);
}
let runCLI;
try {
  ({ runCLI } = require('jest'));
} catch (error) {
  console.warn('[run-tests] `jest` module not found. Jest CLI execution will be skipped.', error);
}
const harness = require('../test/harness');
const { runSuite, rootSuite } = harness;

if (harness.jest) {
  global.jest = harness.jest;
}

const harnessGlobals = ['describe', 'test', 'it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'expect', 'jest'];
for (const key of harnessGlobals) {
  if (typeof harness[key] === 'function') {
    global[key] = harness[key];
  }
}

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
    } else if (esbuild) {
      const result = esbuild.transformSync(content, {
        loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'cjs',
        target: 'es2020'
      });
      module._compile(result.code, filename);
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
  const roots = [
    path.join(__dirname, '..', 'test'),
    path.join(__dirname, '..', 'backend', 'actions', '__tests__'),
    path.join(__dirname, '__tests__'),
  ];
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

  if (runCLI) {
    const jestConfig = require('../jest.config.cjs');
    const { results } = await runCLI(
      {
        config: JSON.stringify(jestConfig),
        runInBand: true,
      },
      [process.cwd()]
    );

    if (!results.success) {
      throw new Error('Jest tests failed');
    }
  } else {
    console.warn('[run-tests] Jest CLI skipped because the module is unavailable.');
  }
}

main().catch((err) => {
  console.error('[run-tests] Test run failed', err);
  process.exit(1);
});
