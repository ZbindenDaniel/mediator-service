const fs = require('fs');
const path = require('path');
// TODO(agent): Keep the Jest helper exposure obvious so future harness updates remain straightforward.
// TODO(agent): Revisit native module checks once test runs can rely on an in-memory DB substitute.
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
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))
    ) {
      // Skip tests that use SQLite db.exec/db.prepare directly (todo 0k — need rewrite for Postgres)
      const content = fs.readFileSync(full, 'utf8');
      // Detect files that import values from a module they also jest.mock() —
      // the harness doesn't hoist jest.mock() like Jest does, so the import
      // runs before the mock is registered, breaking toHaveBeenCalledWith assertions.
      const hasMockAndValueImportConflict = content.includes('jest.mock(') &&
        (() => {
          const mockTargets = [...content.matchAll(/jest\.mock\(['"]([^'"]+)['"]/g)].map(m => m[1]);
          return mockTargets.some(target => {
            const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`^import\\s+(?:\\{[^}]+\\}|\\*\\s+as\\s+\\w+)\\s+from\\s+['"]${escaped}['"]`, 'm').test(content);
          });
        })();
      if (content.includes('db.exec(') || content.includes('db.prepare(') ||
          content.includes('ensureAgenticRunSchema') ||
          entry.name === 'csv-import-duplicate-guard.test.ts' ||
          content.includes('clearShopwareSyncQueue') || content.includes('enqueueShopwareSyncJob') ||
          // Skip files that mock db-client or db via jest.mock — those require Jest hoisting to work
          (content.includes('jest.mock(') && (content.includes("'../../db-client'") || content.includes('"../../db-client"') || content.includes("'../db-client'") || content.includes('"../db-client"') || content.includes("'../../db'") || content.includes('"../../db"'))) ||
          // Skip files that top-level jest.mock a module and wrap everything in describe.skip
          // — loading them poisons the module cache for subsequent tests in the harness run
          (content.includes('jest.mock(') && content.includes('describe.skip(')) ||
          hasMockAndValueImportConflict) {
        console.log(`[run-tests] skipping test (requires Jest module hoisting): ${entry.name}`);
      } else {
        matches.push(full);
      }
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
  let harnessError = null;
  try {
    await runSuite(rootSuite);
  } catch (err) {
    harnessError = err;
  }

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

  if (harnessError) {
    throw harnessError;
  }
}

main().catch((err) => {
  console.error('[run-tests] Test run failed', err);
  process.exit(1);
});
