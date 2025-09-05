import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { HOSTNAME, HTTP_PORT } from '../config';

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
      const item = ctx.getItem.get(id);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      const zpl = ctx.zplForItem({ materialNumber: item.Artikel_Nummer, itemUUID: item.ItemUUID });
      let previewUrl = '';
      try {
        const urlToUi = `${HOSTNAME}:${HTTP_PORT}/items/${encodeURIComponent(item.ItemUUID)}`;
        const out = path.join(ctx.PREVIEW_DIR, `item-${item.ItemUUID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, '_'));
        await ctx.pdfForItem({ materialNumber: item.Artikel_Nummer, itemUUID: item.ItemUUID, url: urlToUi, outPath: out });
        previewUrl = `/prints/${path.basename(out)}`;
        ctx.logEvent.run({ Actor: null, EntityType: 'Item', EntityId: item.ItemUUID, Event: 'PrintPreviewSaved', Meta: JSON.stringify({ file: previewUrl }) });
      } catch (err) {
        console.error('Preview generation failed', err);
      }
      const result = await ctx.sendZpl(zpl);
      if (result.sent) {
        ctx.logEvent.run({ Actor: null, EntityType: 'Item', EntityId: item.ItemUUID, Event: 'PrintSent', Meta: JSON.stringify({ transport: 'tcp' }) });
      }
      return sendJson(res, 200, { sent: !!result.sent, previewUrl, reason: result.reason });
    } catch (err) {
      console.error('Print item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print item API</p></div>'
};

export default action;
