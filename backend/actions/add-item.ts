import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
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
      const itemRefId = item.ItemRefID ?? null;
      const txn = ctx.db.transaction((u: string, a: string) => {
        try {
          ctx.incrementQuant(u);
        } catch (incrementErr) {
          console.error('[add-item] Failed to increment item quantity', { itemUUID: u, error: incrementErr });
          throw incrementErr;
        }

        let updated: any;
        try {
          updated = ctx.getItem.get(u);
        } catch (lookupErr) {
          console.error('[add-item] Failed to reload item after increment', { itemUUID: u, error: lookupErr });
          throw lookupErr;
        }

        const effectiveRefId = updated?.ItemRefID ?? itemRefId;
        const meta = {
          toBox: updated?.BoxID ?? item.BoxID ?? null,
          before: currentQty,
          after: updated?.Auf_Lager ?? 0,
          refId: effectiveRefId,
          quant: {
            ItemUUID: u,
            ItemRefID: effectiveRefId,
            BoxID: updated?.BoxID ?? item.BoxID ?? null,
            Location: updated?.Location ?? updated?.StoredLocation ?? null
          }
        };

        ctx.logEvent.run({
          Actor: a,
          EntityType: 'Item',
          EntityId: u,
          Event: 'Added',
          Meta: JSON.stringify(meta)
        });

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
};

export default action;
