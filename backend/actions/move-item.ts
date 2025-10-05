import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { normaliseItemQuant } from '../../models';

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
      const quant = normaliseItemQuant(item);
      if (!quant) {
        console.error('move-item: invalid item payload', { itemId: uuid, payload: item });
        return sendJson(res, 500, { error: 'invalid item payload' });
      }
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const toBoxId = (data.toBoxId || null);
      const actor = (data.actor || '').trim();
      if (!toBoxId || !actor) return sendJson(res, 400, { error: 'toBoxId and actor are required' });
      const dest = ctx.getBox.get(toBoxId);
      if (!dest) return sendJson(res, 404, { error: 'destination box not found' });
      const rawLocation = dest.Location;
      const normalizedLocation = typeof rawLocation === 'string' ? rawLocation.trim() : null;
      if (!normalizedLocation) {
        console.warn('[move-item] Destination box missing Location', { itemId: uuid, boxId: toBoxId });
      }
      const txn = ctx.db.transaction((u: string, to: string, a: string, from: string, location: string | null) => {
        ctx.updateQuantPlacement(u, to, location);
        ctx.logEvent.run({ Actor: a, EntityType: 'Item', EntityId: u, Event: 'Moved', Meta: JSON.stringify({ from, to }) });
      });
      txn(uuid, toBoxId, actor, quant.BoxID ?? null, normalizedLocation);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Move item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move item API</p></div>'
};

export default action;

