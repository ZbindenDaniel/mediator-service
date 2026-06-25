import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { generateShopwareCorrelationId, insertQualityAssessment, updateItemQualityAssessment } from '../db';
import { withTransaction, queryOne } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'move-item',
  label: 'Move item',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/items\/[^/]+\/move$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/move$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      const toBoxId = typeof data.toBoxId === 'string' ? data.toBoxId.trim() : '';
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });

      if (!toBoxId) return sendJson(res, 400, { error: 'toBoxId is required' });
      const dest = await ctx.getBox(toBoxId);
      if (!dest) {
        console.warn('[move-item] Destination box not found', { itemId: uuid, boxId: toBoxId });
        return sendJson(res, 404, { error: 'Behälter nicht gefunden!' });
      }
      const rawLocationId = typeof dest.LocationId === 'string' ? dest.LocationId.trim() : null;
      const rawLocation = typeof dest.Location === 'string' ? dest.Location.trim() : null;
      const normalizedLocation = rawLocationId || rawLocation || null;

      const now = new Date().toISOString();

      // Check before move: is this item currently cataloged inside an assembly?
      const wasErfasst = item.BoxID === null || item.BoxID === undefined || item.BoxID === '';
      let assemblyParentUuid: string | null = null;
      if (wasErfasst) {
        const relation = await queryOne<{ ParentItemUUID: string }>(
          `SELECT "ParentItemUUID" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
          [uuid]
        );
        assemblyParentUuid = relation?.ParentItemUUID ?? null;
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE items SET "BoxID"=$1, "Location"=$2, "UpdatedAt"=$3 WHERE "ItemUUID"=$4`,
          [toBoxId, normalizedLocation, now, uuid]
        );
        await ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: uuid,
          Event: 'Moved',
          Meta: JSON.stringify({ from: item.BoxID, to: toBoxId })
        });
        try {
          const correlationId = generateShopwareCorrelationId('move-item', uuid);
          const payload = JSON.stringify({
            actor,
            fromBoxId: item.BoxID || null,
            toBoxId,
            location: normalizedLocation,
            itemUUID: uuid,
            trigger: 'move-item'
          });
          await ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'item-move',
            Payload: payload
          });
        } catch (queueErr) {
          console.error('[move-item] Failed to enqueue Shopware sync job', {
            itemId: uuid,
            error: queueErr
          });
        }
      });

      // If an erfasst component was relocated out of its assembly, mark the parent incomplete
      if (assemblyParentUuid) {
        try {
          const qaId = await insertQualityAssessment({
            tag: 'Ersatzteil',
            value: 1,
            is_complete: false,
            has_defects: null,
            is_functional: false,
            notes: 'Bauteil entnommen',
            reviewed_at: now,
            reviewed_by: actor,
          });
          await updateItemQualityAssessment(assemblyParentUuid, qaId, 1);
          await ctx.logEvent({
            Actor: actor,
            EntityType: 'Item',
            EntityId: assemblyParentUuid,
            Event: 'SparePartRemoved',
            Meta: JSON.stringify({ childItemUUID: uuid, toBoxId })
          });
          try {
            const correlationId = generateShopwareCorrelationId('move-item-parent', assemblyParentUuid);
            await ctx.enqueueShopwareSyncJob({
              CorrelationId: correlationId,
              JobType: 'item-upsert',
              Payload: JSON.stringify({ actor, itemUUID: assemblyParentUuid, trigger: 'move-item', quality: 1 })
            });
          } catch (queueErr) {
            console.error('[move-item] Failed to enqueue Shopware sync for parent', { assemblyParentUuid, error: queueErr });
          }
        } catch (err) {
          console.error('[move-item] Failed to mark assembly parent incomplete', { assemblyParentUuid, error: err });
        }
      }

      sendJson(res, 200, { ok: true, destinationBoxId: toBoxId, locationId: normalizedLocation });
    } catch (err) {
      console.error('Move item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move item API</p></div>'
});

export default action;
