import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'remove-item',
  label: 'Remove item',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => /^\/api\/items\/[^/]+\/remove$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/remove$/);
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
      if (currentQty <= 0) return sendJson(res, 400, { error: 'item has no stock' });
      const clearedBox = currentQty === 1;
      const txn = ctx.db.transaction((u: string, a: string) => {
        ctx.decrementItemStock.run(u);
        const updated = ctx.getItem.get(u);
        ctx.logEvent({
          Actor: a,
          EntityType: 'Item',
          EntityId: u,
          Event: 'Removed',
          Meta: JSON.stringify({
            fromBox: item.BoxID,
            before: currentQty,
            after: updated?.Auf_Lager ?? 0,
            clearedBox
          })
        });
        try {
          ctx.enqueueShopwareSyncJob({
            itemUUID: u,
            operation: 'stock-decrement',
            triggerSource: 'remove-item',
            payload: {
              actor: a,
              quantityBefore: currentQty,
              quantityAfter: updated?.Auf_Lager ?? 0,
              clearedBox
            }
          });
        } catch (queueErr) {
          console.error('[remove-item] Failed to enqueue Shopware sync job', {
            itemId: u,
            error: queueErr
          });
        }
        return updated;
      });
      const updated = txn(uuid, actor);
      console.log('Removed item', uuid, 'new qty', updated?.Auf_Lager);
      sendJson(res, 200, { ok: true, quantity: updated?.Auf_Lager ?? 0, boxId: updated?.BoxID ?? null });
    } catch (err) {
      console.error('Remove item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Remove item API</p></div>'
};

export default action;
