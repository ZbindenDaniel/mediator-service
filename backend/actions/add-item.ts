import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { generateShopwareCorrelationId } from '../db';
import { ItemEinheit } from '../../models';

// TODO(agent): Validate Artikel_Nummer requirements for instance creation during add-item flows.
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
      const currentQty = resolveCurrentQuantity(item.Auf_Lager);
      const isBulk = isBulkEinheit(item.Einheit);
      let newItemUUID: string | null = null;
      if (!isBulk) {
        try {
          const attempts = 5;
          for (let index = 0; index < attempts; index += 1) {
            const candidate = await ctx.generateItemUUID(item.Artikel_Nummer ?? null);
            if (!ctx.getItem.get(candidate)) {
              newItemUUID = candidate;
              break;
            }
          }
          if (!newItemUUID) {
            throw new Error('Failed to mint unique ItemUUID for add-item');
          }
        } catch (mintErr) {
          console.error('[add-item] Failed to mint ItemUUID for instance creation', {
            actor: actor,
            itemId: uuid,
            artikelNummer: item.Artikel_Nummer ?? null,
            error: mintErr
          });
          return sendJson(res, 500, { error: 'Failed to mint ItemUUID for instance creation' });
        }
      }
      const txn = ctx.db.transaction((u: string, a: string) => {
        if (isBulk) {
          try {
            ctx.incrementItemStock.run(u);
          } catch (updateErr) {
            console.error('[add-item] Failed to increment bulk stock', {
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
          return { updated, createdItemId: null };
        }

        if (!newItemUUID) {
          throw new Error('Missing ItemUUID for instance creation');
        }

        const now = new Date();
        try {
          ctx.persistItemWithinTransaction({
            ItemUUID: newItemUUID,
            Artikel_Nummer: item.Artikel_Nummer ?? null,
            BoxID: item.BoxID ?? null,
            Location: item.Location ?? null,
            UpdatedAt: now,
            Datum_erfasst: item.Datum_erfasst ?? now,
            Auf_Lager: 1,
            Quality: item.Quality ?? null,
            ShopwareVariantId: item.ShopwareVariantId ?? null,
            __skipReferencePersistence: true
          });
        } catch (createErr) {
          console.error('[add-item] Failed to persist new item instance', {
            actor: a,
            itemId: u,
            newItemId: newItemUUID,
            quantityDelta: 1,
            error: createErr
          });
          throw createErr;
        }

        ctx.logEvent({
          Actor: a,
          EntityType: 'Item',
          EntityId: newItemUUID,
          Event: 'Added',
          Meta: JSON.stringify({
            toBox: item.BoxID ?? null,
            quantityDelta: 1,
            sourceItemId: u
          })
        });

        try {
          const correlationId = generateShopwareCorrelationId('add-item-instance', newItemUUID);
          const payload = JSON.stringify({
            actor: a,
            quantityDelta: 1,
            itemUUID: newItemUUID,
            sourceItemUUID: u,
            trigger: 'add-item'
          });
          ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'item-upsert',
            Payload: payload
          });
        } catch (queueErr) {
          console.error('[add-item] Failed to enqueue Shopware sync job for instance add', {
            actor: a,
            itemId: u,
            newItemId: newItemUUID,
            error: queueErr
          });
        }

        return { updated: null, createdItemId: newItemUUID };
      });
      const result = txn(uuid, actor);
      if (isBulk) {
        console.log(`Stock increased for ${uuid} by ${actor}`);
      } else {
        console.log('Created item instance for add', {
          actor,
          sourceItemId: uuid,
          newItemId: result.createdItemId
        });
      }
      sendJson(res, 200, {
        ok: true,
        quantity: isBulk ? result.updated?.Auf_Lager ?? 0 : 1,
        createdItemId: result.createdItemId ?? null
      });
    } catch (err) {
      console.error('Add item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Add item API</p></div>'
});

export default action;
