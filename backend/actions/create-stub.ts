import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { randomBytes } from 'crypto';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const action = defineHttpAction({
  key: 'create-stub',
  label: 'Create stub',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/stubs' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);

      const shelfId = (body.shelfId ?? '').trim();
      const description = (body.description ?? '').trim();
      const createdBy = (body.createdBy ?? 'unknown').trim();
      const numberLooseItems = Math.max(0, parseInt(body.numberLooseItems ?? '0', 10) || 0);
      const numberLooseBoxes = Math.max(0, parseInt(body.numberLooseBoxes ?? '0', 10) || 0);
      const notes = (body.notes ?? '').trim() || null;

      if (!shelfId) return sendJson(res, 400, { error: 'shelfId is required' });
      if (!description) return sendJson(res, 400, { error: 'description is required' });

      const id = randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();

      ctx.createStub({ id, shelfId, description, numberLooseItems, numberLooseBoxes, createdAt, createdBy, notes });

      sendJson(res, 201, { id, shelfId, description, numberLooseItems, numberLooseBoxes, createdAt, createdBy, isActive: 1, notes });
    } catch (err) {
      console.error('create-stub failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Create stub API</p></div>'
});

export default action;
