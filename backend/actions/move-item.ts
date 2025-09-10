import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'move-item',
  label: 'Move item',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/items\/[^/]+\/move$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/move$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      const item = ctx.getItem.get(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const toBoxId = (data.toBoxId || null);
      const actor = (data.actor || '').trim();
      if (!toBoxId || !actor) return sendJson(res, 400, { error: 'toBoxId and actor are required' });
      const dest = ctx.getBox.get(toBoxId);
      if (!dest) return sendJson(res, 404, { error: 'destination box not found' });
      const txn = ctx.db.transaction((u: string, to: string, a: string, from: string) => {
        ctx.db.prepare(`UPDATE items SET BoxID=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(to, u);
        ctx.logEvent.run({ Actor: a, EntityType: 'Item', EntityId: u, Event: 'Moved', Meta: JSON.stringify({ from, to }) });
      });
      txn(uuid, toBoxId, actor, item.BoxID);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Move item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move item API</p></div>'
};

export default action;

