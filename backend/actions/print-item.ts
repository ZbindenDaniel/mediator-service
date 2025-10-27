import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Item } from '../../models';
import type { ItemLabelPayload } from '../labelpdf';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'print-item',
  label: 'Print item label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/item\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const m = req.url?.match(/^\/api\/print\/item\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid item id' });
      const item = ctx.getItem.get(id) as Item | undefined;
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      const zpl = ctx.zplForItem({ materialNumber: item.Artikel_Nummer, itemUUID: item.ItemUUID });
      const quantityRaw = item.Auf_Lager as unknown;
      let parsedQuantity = 0;
      if (typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)) {
        parsedQuantity = quantityRaw;
      } else if (typeof quantityRaw === 'string') {
        const parsed = Number.parseFloat(quantityRaw);
        if (Number.isFinite(parsed)) parsedQuantity = parsed;
      }

      const description = item.Kurzbeschreibung?.trim() || item.Artikelbeschreibung?.trim() || item.Langtext?.trim() || null;
      const toIsoString = (value: unknown): string | null => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value as string);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };

      const itemData: ItemLabelPayload = {
        type: 'item',
        id: item.ItemUUID,
        materialNumber: item.Artikel_Nummer?.trim() || null,
        boxId: item.BoxID || null,
        location: item.Location?.trim() || null,
        description,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : null,
        addedAt: toIsoString(item.Datum_erfasst || item.UpdatedAt),
        updatedAt: toIsoString(item.UpdatedAt)
      };
      let previewUrl = '';
      try {
        const out = path.join(ctx.PREVIEW_DIR, `item-${item.ItemUUID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, '_'));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await ctx.pdfForItem({ itemData, outPath: out });
        previewUrl = `/prints/${path.basename(out)}`;
        ctx.logEvent({
          Actor: null,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintPreviewSaved',
          Meta: JSON.stringify({ file: previewUrl, qrPayload: itemData })
        });
        console.log('Item label preview generated', { itemId: item.ItemUUID, previewUrl, qrPayload: itemData });
      } catch (err) {
        console.error('Preview generation failed', err);
      }
      const result = await ctx.sendZpl(zpl);
      if (result.sent) {
        ctx.logEvent({
          Actor: null,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintSent',
          Meta: JSON.stringify({ transport: 'tcp' })
        });
      }
      return sendJson(res, 200, { sent: !!result.sent, previewUrl, reason: result.reason, qrPayload: itemData });
    } catch (err) {
      console.error('Print item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print item API</p></div>'
};

export default action;
