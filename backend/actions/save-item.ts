import type { IncomingMessage, ServerResponse } from 'http';
import { Item } from '../../models';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'save-item',
  label: 'Save item',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => /^\/api\/items\/[^/]+$/.test(path) && ['GET', 'PUT'].includes(method),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const match = req.url?.match(/^\/api\/items\/([^/]+)/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) return sendJson(res, 400, { error: 'Invalid item id' });

    if (req.method === 'GET') {
      try {
        const item = ctx.getItem.get(itemId);
        if (!item) return sendJson(res, 404, { error: 'Not found' });
        const box = ctx.getBox.get(item.BoxID);
        const events = ctx.listEventsForItem.all(itemId);
        return sendJson(res, 200, { item, box, events });
      } catch (err) {
        console.error('Fetch item failed', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    }

    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = raw ? JSON.parse(raw) : {};
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const existing = ctx.getItem.get(itemId) || {};
      const item: Item = {
        ...existing,
        ...data,
        ItemUUID: itemId,
        BoxID: data.BoxID ?? existing.BoxID ?? '',
        UpdatedAt: new Date().toISOString()
      };
        const txn = ctx.db.transaction((it: Item, a: string) => {
          ctx.upsertItem.run(it);
          ctx.logEvent.run({
            Actor: a,
            EntityType: 'Item',
            EntityId: it.ItemUUID,
            Event: 'updated',
            Meta: null
          });
        });
        txn(item, actor);
        sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Save item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Item update API</p></div>'
};

export default action;
