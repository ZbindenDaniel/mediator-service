// Standalone print-agent process (docs/PLANNING_multi_instance.md, Component 2).
//
// Runs at a physical location next to a local CUPS instance. Deliberately does NOT
// import backend/config.ts, backend/db.ts, backend/print.ts or backend/utils/cups-client.ts —
// those modules are DB-backed (getSetting() hits Postgres) and this process must hold no
// DB credentials, only the shared AGENT_TOKEN and a CUPS hostname. It talks to the cloud
// app over a WebSocket control plane (liveness + job_available wake-ups) and a small
// AGENT_TOKEN-authenticated HTTP API (claim-job / job status) for the actual data plane.
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import WebSocket from 'ws';

const APP_URL = (process.env.APP_URL || '').trim();
const AGENT_TOKEN = (process.env.AGENT_TOKEN || '').trim();
const INSTANCE_ID = (process.env.INSTANCE_ID || '').trim();
const CUPS_HOST = (process.env.CUPS_HOST || 'localhost').trim();
const QUEUES = (process.env.AGENT_QUEUES || '').split(',').map((q) => q.trim()).filter(Boolean);
const LP_COMMAND = (process.env.LP_COMMAND || 'lp').trim() || 'lp';
const FALLBACK_POLL_MS = 30_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

if (!APP_URL || !AGENT_TOKEN || !INSTANCE_ID) {
  console.error('[print-agent] APP_URL, AGENT_TOKEN and INSTANCE_ID are required');
  process.exit(1);
}

// Derive the plain HTTP(S) base URL for the claim-job/status API from the ws(s):// control-plane URL.
const apiBaseUrl = APP_URL.replace(/^ws/, 'http').replace(/\/agent\/?$/, '');

function apiRequest(method: string, urlPath: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlPath, apiBaseUrl);
    const lib = target.protocol === 'https:' ? https : http;
    const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined;
    const req = lib.request(
      target,
      {
        method,
        headers: {
          Authorization: `Bearer ${AGENT_TOKEN}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, json: raw ? JSON.parse(raw) : null });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function printHtmlViaLocalCups(html: string, queue: string, jobName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `print-agent-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf8');
    const args = ['-h', CUPS_HOST, '-d', queue, '-t', jobName, tmpFile];
    const proc = spawn(LP_COMMAND, args);
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      fs.unlink(tmpFile, () => undefined);
      reject(err);
    });
    proc.on('close', (code) => {
      fs.unlink(tmpFile, () => undefined);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `lp exited with code ${code}`));
    });
  });
}

let claiming = false;

async function claimAndPrintOnce(): Promise<void> {
  if (claiming) return;
  claiming = true;
  try {
    const { status, json } = await apiRequest('POST', '/api/agent/claim-job', { queues: QUEUES });
    if (status !== 200 || !json?.job) return;
    const { job, html } = json as { job: { id: number; itemUUID: string }; html: string };
    const queue = QUEUES[0];
    if (!queue) {
      console.error('[print-agent] Claimed job but no local queue configured', job.id);
      await apiRequest('POST', `/api/agent/jobs/${job.id}/status`, { status: 'Error', error: 'no_local_queue_configured' });
      return;
    }
    try {
      await printHtmlViaLocalCups(html, queue, `Item ${job.itemUUID}`);
      await apiRequest('POST', `/api/agent/jobs/${job.id}/status`, { status: 'Done' });
      console.log('[print-agent] Printed label for', job.itemUUID);
    } catch (err) {
      console.error('[print-agent] Local CUPS print failed', job.id, err);
      await apiRequest('POST', `/api/agent/jobs/${job.id}/status`, { status: 'Error', error: (err as Error).message });
    }
  } catch (err) {
    console.error('[print-agent] claim-job request failed', err);
  } finally {
    claiming = false;
  }
}

let reconnectDelay = RECONNECT_MIN_MS;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function connect(): void {
  const ws = new WebSocket(`${APP_URL.replace(/\/$/, '')}`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });

  ws.on('open', () => {
    reconnectDelay = RECONNECT_MIN_MS;
    console.log('[print-agent] Connected to', APP_URL);
    ws.send(JSON.stringify({ type: 'hello', instanceId: INSTANCE_ID, queues: QUEUES }));
    void claimAndPrintOnce();
  });

  ws.on('message', (raw) => {
    let msg: { type?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'job_available') {
      void claimAndPrintOnce();
    }
  });

  ws.on('error', (err) => {
    console.error('[print-agent] WebSocket error', err.message);
  });

  ws.on('close', () => {
    console.warn('[print-agent] Disconnected, reconnecting in', reconnectDelay, 'ms');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });
}

// Safety net for a missed/dropped job_available message between disconnect and reconnect —
// the socket carries the real-time signal, so this only needs to be a slow backstop (30s).
pollTimer = setInterval(() => void claimAndPrintOnce(), FALLBACK_POLL_MS);

connect();

process.on('SIGTERM', () => {
  if (pollTimer) clearInterval(pollTimer);
  process.exit(0);
});
