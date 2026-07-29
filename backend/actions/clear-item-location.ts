import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { clearItemLocation, generateShopwareCorrelationId } from '../db';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Removes only the box assignment (keeps stock). Used by the inventory scan exit route
// for items that were recorded in a box but not scanned — they stay in inventory, just
// with no location, rather than being withdrawn like remove-item does.
const action = defineHttpAction({
  key: 'clear-item-location',
  label: 'Clear item location',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/items\/[^/]+\/clear-location$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/clear-location$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });

      const fromBox = item.BoxID ?? null;

      await clearItemLocation(uuid);

      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: uuid,
        Event: 'LocationCleared',
        Meta: JSON.stringify({ fromBox })
      });

      try {
        const correlationId = generateShopwareCorrelationId('clear-item-location', uuid);
        await ctx.enqueueShopwareSyncJob({
          CorrelationId: correlationId,
          JobType: 'item-move',
          Payload: JSON.stringify({
            actor,
            fromBoxId: fromBox,
            toBoxId: null,
            location: null,
            itemUUID: uuid,
            trigger: 'clear-item-location'
          })
        });
      } catch (queueErr) {
        console.error('[clear-item-location] Failed to enqueue Shopware sync job', {
          itemId: uuid,
          error: queueErr
        });
      }

      sendJson(res, 200, { ok: true, fromBox });
    } catch (err) {
      console.error('Clear item location failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Clear item location API</p></div>'
});

export default action;
