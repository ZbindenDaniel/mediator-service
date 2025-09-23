import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
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
        const agentic = ctx.getAgenticRunForItem ? ctx.getAgenticRunForItem.get(itemId) : null;
        return sendJson(res, 200, { item, box, events, agentic });
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
      let grafik = existing.Grafikname || '';
      try {
        const imgs = [data.picture1, data.picture2, data.picture3];
        const dir = path.join(__dirname, '../../media', itemId);
        const artNr = data.Artikel_Nummer || existing.Artikel_Nummer || itemId;
        if (imgs.some((i: string) => i)) fs.mkdirSync(dir, { recursive: true });
        imgs.forEach((img: string, idx: number) => {
          if (!img) return;
          const m = (img as string).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${artNr}-${idx + 1}.${ext}`;
          fs.writeFileSync(path.join(dir, file), buf);
          if (idx === 0) grafik = `/media/${itemId}/${file}`;
        });
      } catch (e) {
        console.error('Failed to save item images', e);
      }
      const { picture1, picture2, picture3, ...rest } = data;
      const item: Item = {
        ...existing,
        ...rest,
        Grafikname: grafik,
        ItemUUID: itemId,
        BoxID: data.BoxID ?? existing.BoxID ?? '',
        UpdatedAt: new Date()
      };
        const txn = ctx.db.transaction((it: Item, a: string) => {
          ctx.upsertItem.run({
            ...it,
            UpdatedAt: it.UpdatedAt.toISOString(),
            Datum_erfasst: it.Datum_erfasst ? it.Datum_erfasst.toISOString() : null,
            Veröffentlicht_Status:
              typeof it.Veröffentlicht_Status === 'boolean'
                ? it.Veröffentlicht_Status
                  ? 'yes'
                  : 'no'
                : it.Veröffentlicht_Status
          });
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
