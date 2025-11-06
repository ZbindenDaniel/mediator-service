import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { generateShopwareCorrelationId } from '../db';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'add-item',
  label: 'Add item',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => /^\/api\/items\/[^/]+\/add$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/add$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      const item = ctx.getItem.get(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const currentQty = typeof item.Auf_Lager === 'number' ? item.Auf_Lager : 0;
      const txn = ctx.db.transaction((u: string, a: string) => {
        ctx.incrementItemStock.run(u);
        const updated = ctx.getItem.get(u);
        ctx.logEvent({
          Actor: a,
          EntityType: 'Item',
          EntityId: u,
          Event: 'Added',
          Meta: JSON.stringify({
            toBox: item.BoxID,
            before: currentQty,
            after: updated?.Auf_Lager ?? 0
          })
        });
        try {
          const correlationId = generateShopwareCorrelationId('add-item', u);
          const payload = JSON.stringify({
            actor: a,
            quantityBefore: currentQty,
            quantityAfter: updated?.Auf_Lager ?? 0,
            itemUUID: u,
            trigger: 'add-item'
          });
          ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'stock-increment',
            Payload: payload
          });
        } catch (queueErr) {
          console.error('[add-item] Failed to enqueue Shopware sync job', {
            itemId: u,
            error: queueErr
          });
        }
        return updated;
      });
      const updated = txn(uuid, actor);
      console.log(`Stock increased for ${uuid} by ${actor}`);
      sendJson(res, 200, { ok: true, quantity: updated?.Auf_Lager ?? 0 });
    } catch (err) {
      console.error('Add item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Add item API</p></div>'
});

export default action;
