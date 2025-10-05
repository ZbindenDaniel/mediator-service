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
      const itemRefId = item.ItemRefID ?? null;
      const txn = ctx.db.transaction((u: string, a: string) => {
        try {
          ctx.decrementQuant(u);
        } catch (decrementErr) {
          console.error('[remove-item] Failed to decrement item quantity', { itemUUID: u, error: decrementErr });
          throw decrementErr;
        }

        let updated: any;
        try {
          updated = ctx.getItem.get(u);
        } catch (lookupErr) {
          console.error('[remove-item] Failed to reload item after decrement', { itemUUID: u, error: lookupErr });
          throw lookupErr;
        }

        const effectiveRefId = updated?.ItemRefID ?? itemRefId;
        const meta = {
          fromBox: item.BoxID,
          before: currentQty,
          after: updated?.Auf_Lager ?? 0,
          clearedBox,
          refId: effectiveRefId,
          quant: {
            ItemUUID: u,
            ItemRefID: effectiveRefId,
            BoxID: updated?.BoxID ?? null,
            Location: updated?.Location ?? updated?.StoredLocation ?? null
          }
        };

        ctx.logEvent.run({
          Actor: a,
          EntityType: 'Item',
          EntityId: u,
          Event: 'Removed',
          Meta: JSON.stringify(meta)
        });
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
