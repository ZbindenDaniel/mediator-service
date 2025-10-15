import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

// TODO: Allow executing the smoke test directly against TypeScript sources without requiring a prior build step.
const projectRoot = path.resolve(__dirname, '..');
const distServerPath = path.resolve(projectRoot, 'dist', 'backend', 'server.js');
const tlsFixturesDir = path.resolve(projectRoot, 'test', 'fixtures', 'tls');
const tlsKeyPath = path.resolve(tlsFixturesDir, 'localhost-key.pem');
const tlsCertPath = path.resolve(tlsFixturesDir, 'localhost-cert.pem');

if (!fs.existsSync(distServerPath)) {
  console.error('[smoke] Build output not found at dist/backend/server.js. Run "npm run build" before executing the smoke test.');
  process.exit(1);
}

if (!fs.existsSync(tlsKeyPath) || !fs.existsSync(tlsCertPath)) {
  console.error('[smoke] TLS fixtures are missing. Ensure test/fixtures/tls contains localhost-key.pem and localhost-cert.pem.');
  process.exit(1);
}

function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  label: string,
  predicate: (text: string) => boolean,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      buffer += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          console.log(`[${label}] ${line}`);
        }
      }
      if (predicate(buffer)) {
        cleanup();
        resolve();
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`[smoke] Server process exited before readiness (code=${code}, signal=${signal ?? 'null'})`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('[smoke] Timed out waiting for server readiness output.'));
    }, timeoutMs);

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}

function shutdown(child: ChildProcessWithoutNullStreams, label: string): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) {
        console.warn(`[${label}] Forcing process termination after timeout.`);
        try {
          child.kill('SIGKILL');
        } catch (error) {
          console.error(`[${label}] Failed to SIGKILL process`, error);
        }
      }
    }, 2000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    } catch (error) {
      console.error(`[${label}] Error while sending SIGTERM`, error);
    }
  });
}

function probe(url: URL, insecureTls = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : isHttps ? 443 : 80,
      path: `${url.pathname}${url.search}` || '/',
      method: 'GET',
      timeout: 3000,
      rejectUnauthorized: isHttps ? !insecureTls : undefined
    };

    const request = transport.request(options, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });

    request.on('timeout', () => {
      request.destroy(new Error('request_timeout'));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

async function runHttpMode(): Promise<void> {
  console.info('[smoke] Starting HTTP fallback verification...');
  const port = 38080;
  const child = spawn(process.execPath, [distServerPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'smoke',
      HTTP_PORT: String(port),
      PUBLIC_HOSTNAME: '127.0.0.1',
      PUBLIC_PROTOCOL: 'http',
      PUBLIC_PORT: String(port),
      TLS_CERT_PATH: '',
      TLS_KEY_PATH: ''
    }
  });

  try {
    await waitForOutput(child, 'http', (text) => text.includes('HTTP server listening at'), 8000);
    const status = await probe(new URL('http://127.0.0.1:38080/api/smoke-check'), false);
    if (status !== 404) {
      throw new Error(`[smoke] Expected HTTP smoke probe to return 404, received ${status}`);
    }
    console.info('[smoke] HTTP fallback responded as expected.');
  } finally {
    await shutdown(child, 'http');
  }
}

async function runHttpsMode(): Promise<void> {
  console.info('[smoke] Starting HTTPS verification...');
  const httpsPort = 38443;
  const httpFallbackPort = 38081;
  const child = spawn(process.execPath, [distServerPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'smoke',
      HTTP_PORT: String(httpFallbackPort),
      HTTPS_PORT: String(httpsPort),
      PUBLIC_HOSTNAME: '127.0.0.1',
      PUBLIC_PROTOCOL: 'https',
      PUBLIC_PORT: String(httpsPort),
      TLS_CERT_PATH: tlsCertPath,
      TLS_KEY_PATH: tlsKeyPath
    }
  });

  try {
    await waitForOutput(child, 'https', (text) => text.includes('HTTPS server listening at'), 12000);
    const status = await probe(new URL(`https://127.0.0.1:${httpsPort}/api/smoke-check`), true);
    if (status !== 404) {
      throw new Error(`[smoke] Expected HTTPS smoke probe to return 404, received ${status}`);
    }
    console.info('[smoke] HTTPS endpoint responded as expected.');
  } finally {
    await shutdown(child, 'https');
  }
}

(async () => {
  try {
    await runHttpMode();
    await runHttpsMode();
    console.info('[smoke] HTTP and HTTPS smoke checks completed successfully.');
  } catch (error) {
    console.error('[smoke] Smoke test failed', error);
    process.exitCode = 1;
  }
})();
