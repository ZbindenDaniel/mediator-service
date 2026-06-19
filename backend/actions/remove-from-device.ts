import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { execute, queryOne } from '../db-client';
import { insertQualityAssessment, updateItemQualityAssessment, generateShopwareCorrelationId } from '../db';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'remove-from-device',
  label: 'Remove spare part from device',
  appliesTo: () => false,
  matches: (path, method) =>
    /^\/api\/items\/[^/]+\/remove-from-device$/.test(path) && method === 'POST',

  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/remove-from-device$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });

      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const toBoxId = typeof data.toBoxId === 'string' ? data.toBoxId.trim() : '';

      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!toBoxId) return sendJson(res, 400, { error: 'toBoxId is required' });

      // Verify the item has a Zerlegt_aus relation to get the parent device UUID
      const relation = await queryOne<{ ParentItemUUID: string }>(
        `SELECT "ParentItemUUID" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
        [uuid]
      );
      if (!relation) {
        return sendJson(res, 400, { error: 'Artikel ist kein katalogisiertes Ersatzteil (kein Zerlegt_aus-Link)' });
      }
      const parentUuid = relation.ParentItemUUID;

      const dest = await ctx.getBox(toBoxId);
      if (!dest) {
        return sendJson(res, 404, { error: 'Behälter nicht gefunden!' });
      }

      const rawLocationId = typeof dest.LocationId === 'string' ? dest.LocationId.trim() : null;
      const rawLocation = typeof dest.Location === 'string' ? dest.Location.trim() : null;
      const normalizedLocation = rawLocationId || rawLocation || null;
      const now = new Date().toISOString();

      // 1. Relocate the spare part to the destination box
      await execute(
        `UPDATE items SET "BoxID"=$1, "Location"=$2, "UpdatedAt"=$3 WHERE "ItemUUID"=$4`,
        [toBoxId, normalizedLocation, now, uuid]
      );

      // 2. Mark parent device as Ersatzteil via quality assessment
      let qualityAssessmentId: number | null = null;
      try {
        qualityAssessmentId = await insertQualityAssessment({
          tag: 'Ersatzteil',
          value: 1,
          is_complete: false,
          has_defects: null,
          is_functional: false,
          notes: 'Ersatzteil entnommen',
          reviewed_at: now,
          reviewed_by: actor,
        });
        await updateItemQualityAssessment(parentUuid, qualityAssessmentId, 1);
      } catch (qaErr) {
        console.error('[remove-from-device] Failed to update parent device quality', { parentUuid, error: qaErr });
      }

      // Log events
      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: uuid,
        Event: 'RemovedFromDevice',
        Meta: JSON.stringify({ parentUuid, toBoxId, location: normalizedLocation })
      });
      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: parentUuid,
        Event: 'SparePartRemoved',
        Meta: JSON.stringify({ childItemUUID: uuid, toBoxId, qualityAssessmentId })
      });

      // Enqueue Shopware sync for parent device quality change
      try {
        const correlationId = generateShopwareCorrelationId('remove-from-device', parentUuid);
        await ctx.enqueueShopwareSyncJob({
          CorrelationId: correlationId,
          JobType: 'item-upsert',
          Payload: JSON.stringify({ actor, itemUUID: parentUuid, trigger: 'remove-from-device', quality: 1 })
        });
      } catch (queueErr) {
        console.error('[remove-from-device] Failed to enqueue Shopware sync job', { parentUuid, error: queueErr });
      }

      console.info('[remove-from-device] Spare part relocated', { uuid, parentUuid, toBoxId, actor });
      return sendJson(res, 200, { ok: true, toBoxId, locationId: normalizedLocation });
    } catch (err) {
      console.error('[remove-from-device] Unexpected error', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Remove from device API</p></div>'
});

export default action;
