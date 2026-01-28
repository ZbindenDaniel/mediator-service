import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { generateShopwareCorrelationId } from '../db';
import { ItemEinheit } from '../../models';
// TODO(agent): Verify non-bulk removals keep grouping/list views consistent after zeroing stock.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isBulkEinheit(value: unknown): boolean {
  return value === ItemEinheit.Menge;
}

function resolveCurrentQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const action = defineHttpAction({
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
      const currentQty = resolveCurrentQuantity(item.Auf_Lager);
      const isBulk = isBulkEinheit(item.Einheit);
      if (isBulk && currentQty <= 0) return sendJson(res, 400, { error: 'item has no stock' });
      const clearedBox = isBulk ? currentQty === 1 : true;
      const txn = ctx.db.transaction((u: string, a: string) => {
        if (isBulk) {
          try {
            ctx.decrementItemStock.run(u);
          } catch (updateErr) {
            console.error('[remove-item] Failed to decrement bulk stock', {
              actor: a,
              itemId: u,
              quantityBefore: currentQty,
              error: updateErr
            });
            throw updateErr;
          }
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
            const correlationId = generateShopwareCorrelationId('remove-item', u);
            const payload = JSON.stringify({
              actor: a,
              quantityBefore: currentQty,
              quantityAfter: updated?.Auf_Lager ?? 0,
              clearedBox,
              itemUUID: u,
              trigger: 'remove-item'
            });
            ctx.enqueueShopwareSyncJob({
              CorrelationId: correlationId,
              JobType: 'stock-decrement',
              Payload: payload
            });
          } catch (queueErr) {
            console.error('[remove-item] Failed to enqueue Shopware sync job', {
              itemId: u,
              error: queueErr
            });
          }
          return { updated, deleted: false };
        }

        try {
          ctx.zeroItemStock.run(u);
        } catch (updateErr) {
          console.error('[remove-item] Failed to zero item stock for instance removal', {
            actor: a,
            itemId: u,
            quantityBefore: currentQty,
            error: updateErr
          });
          throw updateErr;
        }

        const updated = ctx.getItem.get(u);
        console.info('[remove-item] Cleared item instance stock', {
          actor: a,
          itemId: u,
          quantityBefore: currentQty,
          quantityAfter: updated?.Auf_Lager ?? 0
        });

        ctx.logEvent({
          Actor: a,
          EntityType: 'Item',
          EntityId: u,
          Event: 'Removed',
          Meta: JSON.stringify({
            fromBox: item.BoxID ?? null,
            quantityBefore: currentQty,
            quantityAfter: 0,
            clearedBox: true
          })
        });

        try {
          const correlationId = generateShopwareCorrelationId('remove-item-instance', u);
          const payload = JSON.stringify({
            actor: a,
            quantityBefore: currentQty,
            quantityAfter: 0,
            clearedBox: true,
            boxId: item.BoxID ?? null,
            itemUUID: u,
            trigger: 'remove-item'
          });
          ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'item-delete',
            Payload: payload
          });
        } catch (queueErr) {
          console.error('[remove-item] Failed to enqueue Shopware sync job for instance removal', {
            actor: a,
            itemId: u,
            error: queueErr
          });
        }

        return { updated, deleted: false };
      });
      const result = txn(uuid, actor);
      if (isBulk) {
        console.log('Removed item', uuid, 'new qty', result.updated?.Auf_Lager);
      } else {
        console.log('Cleared item instance stock for remove', {
          actor,
          itemId: uuid,
          quantityAfter: result.updated?.Auf_Lager ?? 0
        });
      }
      sendJson(res, 200, {
        ok: true,
        quantity: isBulk ? result.updated?.Auf_Lager ?? 0 : 0,
        boxId: isBulk ? result.updated?.BoxID ?? null : null,
        deleted: result.deleted
      });
    } catch (err) {
      console.error('Remove item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Remove item API</p></div>'
});

export default action;
