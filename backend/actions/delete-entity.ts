import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { generateShopwareCorrelationId } from '../db';
import { withTransaction } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'delete-entity',
  label: 'Delete entity',
  appliesTo: (entity) => entity.type === 'Item' || entity.type === 'Box',
  matches: (p, m) => /^\/api\/(items|boxes)\/[^/]+\/delete$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/(items|boxes)\/([^/]+)\/delete$/);
      const type = match ? match[1] : '';
      const id = match ? decodeURIComponent(match[2]) : '';
      if (!type || !id) return sendJson(res, 400, { error: 'invalid path' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      const confirm = !!data.confirm;
      if (!actor || !confirm) return sendJson(res, 400, { error: 'actor and confirm=true required' });
      if (type === 'items') {
        const item = await ctx.getItem(id);
        if (!item) return sendJson(res, 404, { error: 'item not found' });
        await withTransaction(async (_client) => {
          await ctx.deleteItem(id);
          ctx.logEvent({
            Actor: actor,
            EntityType: 'Item',
            EntityId: id,
            Event: 'Deleted',
            Meta: null
          });
          try {
            const correlationId = generateShopwareCorrelationId('delete-entity', id);
            const payload = JSON.stringify({
              actor,
              boxId: item.BoxID ?? null,
              itemUUID: id,
              trigger: 'delete-entity'
            });
            await ctx.enqueueShopwareSyncJob({
              CorrelationId: correlationId,
              JobType: 'item-delete',
              Payload: payload
            });
          } catch (queueErr) {
            console.error('[delete-entity] Failed to enqueue Shopware sync job', {
              itemId: id,
              error: queueErr
            });
          }
        });
      } else {
        const box = await ctx.getBox(id);
        if (!box) return sendJson(res, 404, { error: 'box not found' });
        const items = await ctx.itemsByBox(id);
        if (items.length) return sendJson(res, 400, { error: 'box not empty' });
        await withTransaction(async (_client) => {
          await ctx.deleteBox(id);
          ctx.logEvent({
            Actor: actor,
            EntityType: 'Box',
            EntityId: id,
            Event: 'Deleted',
            Meta: null
          });
        });
      }
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Delete entity failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Delete entity API</p></div>'
});

export default action;
