import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function resolveNodePathExtras(baseDir) {
  const repoRoot = path.join(baseDir, '..', '..');
  const candidates = [
    path.join(repoRoot, 'node_modules', 'eventsource-parser', 'node_modules'),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
}

export async function runMcpClientReconnectTests() {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(baseDir, 'scripts', 'mcpClientReconnectRunner.js');
  const loaderPath = path.join(baseDir, 'scripts', 'zod-loader.mjs');
  const serverPath = path.join(baseDir, 'fixtures', 'fakeMcpServer.js');

  const nodePathExtras = resolveNodePathExtras(baseDir);
  const env = {
    ...process.env,
    MCP_SEARCH_CMD: process.execPath,
    MCP_SEARCH_ARGS: `${serverPath}`,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'test-model',
  };
  if (nodePathExtras.length) {
    env.NODE_PATH = [
      ...nodePathExtras,
      process.env.NODE_PATH,
    ].filter(Boolean).join(path.delimiter);
  }

  const child = spawn(process.execPath, ['--experimental-loader', loaderPath, scriptPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const [code] = await once(child, 'close');
  assert.equal(
    code,
    0,
    `mcpClient reconnect runner failed with code ${code}. stdout: ${stdout || '(empty)'} stderr: ${stderr || '(empty)'}`,
  );
}
