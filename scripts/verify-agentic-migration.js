#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[verify-agentic-migration]';

function registerTypeScriptLoader() {
  try {
    require('ts-node/register');
    console.log(`${LOG_PREFIX} Registered ts-node TypeScript loader.`);
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} Unable to load ts-node/register: ${err.message}`);
  }

  let ts;
  try {
    ts = require('typescript');
  } catch (err) {
    console.warn(`${LOG_PREFIX} Unable to load the typescript compiler: ${err.message}`);
    console.warn(`${LOG_PREFIX} TypeScript files will run without transpilation and may fail.`);
    return false;
  }

  const transpile = (module, filename) => {
    try {
      const source = fs.readFileSync(filename, 'utf8');
      const result = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
        fileName: filename,
      });
      module._compile(result.outputText, filename);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to transpile ${path.relative(process.cwd(), filename)}`, error);
      throw error;
    }
  };

  require.extensions['.ts'] = transpile;
  require.extensions['.tsx'] = transpile;
  console.log(`${LOG_PREFIX} Registered fallback TypeScript transpiler.`);
  return true;
}

function ensureArgument() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error(`${LOG_PREFIX} Usage: node scripts/verify-agentic-migration.js <db-path>`);
    process.exit(1);
  }
  return dbPath;
}

function verifyAgenticRunsSchema(db) {
  const expectedColumns = [
    'Id',
    'ItemUUID',
    'SearchQuery',
    'Status',
    'TriggeredAt',
    'StartedAt',
    'CompletedAt',
    'FailedAt',
    'Summary',
    'NeedsReview',
    'ReviewedBy',
    'ReviewedAt',
    'ReviewDecision',
    'ReviewNotes',
  ];
  const legacyColumns = ['LastError', 'ResultPayload'];

  let columns;
  try {
    columns = db.prepare(`PRAGMA table_info(agentic_runs)`).all();
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to inspect agentic_runs schema`, error);
    throw error;
  }

  const columnNames = new Set(columns.map((column) => column.name));
  const missing = expectedColumns.filter((column) => !columnNames.has(column));
  const legacy = legacyColumns.filter((column) => columnNames.has(column));

  if (missing.length) {
    throw new Error(`Missing agentic_runs columns: ${missing.join(', ')}`);
  }

  if (legacy.length) {
    throw new Error(`Legacy agentic_runs columns detected: ${legacy.join(', ')}`);
  }

  console.log(`${LOG_PREFIX} agentic_runs schema looks good.`);
}

function main() {
  const dbPath = ensureArgument();
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  process.env.DB_PATH = resolvedPath;
  console.log(`${LOG_PREFIX} Using database at ${resolvedPath}`);

  const loaderRegistered = registerTypeScriptLoader();
  if (!loaderRegistered) {
    console.warn(`${LOG_PREFIX} Continuing without a registered TypeScript loader. If backend/db.ts fails to load, ensure dependencies are installed.`);
  }

  let dbModule;
  try {
    dbModule = require('../backend/db');
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to load backend/db module`, error);
    process.exit(1);
  }

  const db = dbModule.db;
  if (!db) {
    console.error(`${LOG_PREFIX} backend/db did not export a database handle.`);
    process.exit(1);
  }

  try {
    verifyAgenticRunsSchema(db);
  } catch (error) {
    console.error(`${LOG_PREFIX} Verification failed`, error);
    process.exit(1);
  } finally {
    try {
      if (typeof db.close === 'function') {
        db.close();
        console.log(`${LOG_PREFIX} Closed database connection.`);
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to close database`, error);
    }
  }

  console.log(`${LOG_PREFIX} Verification complete.`);
}

try {
  main();
} catch (error) {
  console.error(`${LOG_PREFIX} Unexpected error`, error);
  process.exit(1);
}
