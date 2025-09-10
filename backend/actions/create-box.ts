import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'create-box',
  label: 'Create box',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/boxes\/[^/]+$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/boxes\/([^/]+)$/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const existing = ctx.getBox.get(id);
      if (existing) return sendJson(res, 409, { error: 'box exists' });
      const now = new Date().toISOString();
      const txn = ctx.db.transaction((boxId: string, a: string) => {
        ctx.upsertBox.run({
          BoxID: boxId,
          Location: null,
          CreatedAt: now,
          Notes: null,
          PlacedBy: a,
          PlacedAt: null,
          UpdatedAt: now
        });
        ctx.logEvent.run({ Actor: a, EntityType: 'Box', EntityId: boxId, Event: 'Created', Meta: null });
        console.log('Created box', boxId);
      });
      txn(id, actor);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Create box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Create box API</p></div>'
};

export default action;
