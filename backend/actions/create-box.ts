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
  matches: (path, method) => path === '/api/boxes' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const last = ctx.getMaxBoxId.get() as { BoxID: string } | undefined;
      let seq = 0;
      if (last?.BoxID) {
        const m = last.BoxID.match(/^B-\d{6}-(\d+)$/);
        if (m) seq = parseInt(m[1], 10);
      }
      const nowDate = new Date();
      const dd = String(nowDate.getDate()).padStart(2, '0');
      const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
      const yy = String(nowDate.getFullYear()).slice(-2);
      const idNum = seq + 1;
      const id = `B-${dd}${mm}${yy}-${idNum.toString().padStart(4, '0')}`;
      const now = nowDate.toISOString();
      const txn = ctx.db.transaction((boxId: string, a: string) => {
        ctx.upsertBox.run({
          BoxID: boxId,
          Location: null,
          StandortLabel: null,
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
      sendJson(res, 200, { ok: true, id });
    } catch (err) {
      console.error('Create box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Create box API</p></div>'
};

export default action;
