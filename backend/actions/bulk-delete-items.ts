import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { BulkRemoveResult } from '../db';
import { generateShopwareCorrelationId } from '../db';
import { ItemEinheit } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isConfirmed(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function asQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isBulkEinheit(value: unknown): boolean {
  return value === ItemEinheit.Menge;
}

const action = defineHttpAction({
  key: 'bulk-delete-items',
  label: 'Bulk delete items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items/bulk/delete' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try {
        data = JSON.parse(raw || '{}');
      } catch (parseErr) {
        console.warn('[bulk-delete-items] Failed to parse request body', parseErr);
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const confirm = isConfirmed(data.confirm);
      const itemIdsInput: unknown[] = Array.isArray(data.itemIds) ? data.itemIds : [];
      const itemIds = Array.from(
        new Set(
          itemIdsInput
            .map((value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim()))
            .filter((value) => value.length > 0)
        )
      );

      if (!itemIds.length) return sendJson(res, 400, { error: 'itemIds is required' });
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!confirm) return sendJson(res, 400, { error: 'confirm=true required' });

      const missing: string[] = [];
      const insufficient: Array<{ itemId: string; quantity: number }> = [];
      const bulkItemIds: string[] = [];
      const instanceItems: Array<{ itemId: string; boxId: string | null; quantity: number }> = [];

      for (const id of itemIds) {
        const item = ctx.getItem.get(id);
        if (!item) {
          missing.push(id);
          continue;
        }
        if (isBulkEinheit(item.Einheit)) {
          const quantity = asQuantity(item.Auf_Lager);
          if (quantity <= 0) {
            insufficient.push({ itemId: id, quantity });
          } else {
            bulkItemIds.push(id);
          }
        } else {
          const instanceQuantity = asQuantity(item.Auf_Lager) || 1;
          instanceItems.push({
            itemId: id,
            boxId: item.BoxID ?? null,
            quantity: instanceQuantity
          });
        }
      }

      const validItemIds = [...bulkItemIds, ...instanceItems.map((entry) => entry.itemId)];
      if (!validItemIds.length) {
        if (missing.length) {
          return sendJson(res, 404, { error: 'no items found', itemIds: missing });
        }
        return sendJson(res, 400, { error: 'items have no stock', itemIds: insufficient.map((entry) => entry.itemId) });
      }

      if (missing.length) {
        return sendJson(res, 404, { error: 'items not found', itemIds: missing });
      }
      if (insufficient.length) {
        return sendJson(res, 400, { error: 'items have no stock', itemIds: insufficient.map((entry) => entry.itemId) });
      }

      let results: BulkRemoveResult[] = [];
      if (instanceItems.length) {
        try {
          const runInstanceDeletes = ctx.db.transaction(
            (items: Array<{ itemId: string; boxId: string | null; quantity: number }>): BulkRemoveResult[] => {
              const deleted: BulkRemoveResult[] = [];
              for (const entry of items) {
                try {
                  ctx.deleteItem.run(entry.itemId);
                } catch (deleteErr) {
                  console.error('[bulk-delete-items] Failed to delete item instance', {
                    actor,
                    itemId: entry.itemId,
                    quantityBefore: entry.quantity,
                    error: deleteErr
                  });
                  throw deleteErr;
                }
                ctx.logEvent({
                  Actor: actor,
                  EntityType: 'Item',
                  EntityId: entry.itemId,
                  Event: 'Removed',
                  Meta: JSON.stringify({
                    fromBox: entry.boxId,
                    before: entry.quantity,
                    after: 0,
                    clearedBox: true
                  })
                });
                try {
                  const correlationId = generateShopwareCorrelationId('bulk-delete-instance', entry.itemId);
                  const payload = JSON.stringify({
                    actor,
                    quantityBefore: entry.quantity,
                    quantityAfter: 0,
                    boxId: entry.boxId,
                    itemUUID: entry.itemId,
                    trigger: 'bulk-delete-items'
                  });
                  ctx.enqueueShopwareSyncJob({
                    CorrelationId: correlationId,
                    JobType: 'item-delete',
                    Payload: payload
                  });
                } catch (queueErr) {
                  console.error('[bulk-delete-items] Failed to enqueue Shopware sync job for instance delete', {
                    actor,
                    itemId: entry.itemId,
                    error: queueErr
                  });
                }
                deleted.push({
                  itemId: entry.itemId,
                  fromBoxId: entry.boxId,
                  before: entry.quantity,
                  after: 0,
                  clearedBox: true
                });
              }
              return deleted;
            }
          );
          results = results.concat(runInstanceDeletes(instanceItems));
        } catch (dbErr) {
          console.error('[bulk-delete-items] Instance deletion transaction failed', dbErr);
          return sendJson(res, 500, { error: (dbErr as Error).message });
        }
      }

      if (bulkItemIds.length) {
        try {
          results = results.concat(ctx.bulkRemoveItemStock(bulkItemIds, actor));
        } catch (dbErr) {
          console.error('[bulk-delete-items] Bulk stock removal transaction failed', dbErr);
          return sendJson(res, 500, { error: (dbErr as Error).message });
        }
      }

      console.log('[bulk-delete-items] Removed stock for items', { count: results.length });
      return sendJson(res, 200, {
        ok: true,
        removed: results.length,
        items: results.map((entry) => ({
          itemId: entry.itemId,
          before: entry.before,
          after: entry.after,
          clearedBox: entry.clearedBox
        }))
      });
    } catch (err) {
      console.error('Bulk delete items failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Bulk delete items API</p></div>'
});

export default action;
