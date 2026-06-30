import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAgentAuth } from '../utils/agent-auth';
import { updateLabelJobStatus } from '../db';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

const action = defineHttpAction({
  key: 'agent-job-status',
  label: 'Agent: update label job status',
  appliesTo: () => false,
  matches: (p, method) => /^\/api\/agent\/jobs\/\d+\/status$/.test(p) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAgentAuth(req, res)) return;
    const match = (req.url || '').match(/^\/api\/agent\/jobs\/(\d+)\/status/);
    const id = match ? Number.parseInt(match[1], 10) : NaN;
    if (!Number.isFinite(id)) {
      return sendJson(res, 400, { error: 'Invalid job id' });
    }
    let payload: { status?: unknown; error?: unknown };
    try {
      payload = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    const status = typeof payload.status === 'string' ? payload.status : null;
    if (!status) {
      return sendJson(res, 400, { error: 'status is required' });
    }
    const error = typeof payload.error === 'string' ? payload.error : null;
    try {
      await updateLabelJobStatus(id, status, error);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[agent-job-status] Failed to update job status', id, err);
      return sendJson(res, 500, { error: 'Failed to update job status' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agent job status API</p></div>'
});

export default action;
