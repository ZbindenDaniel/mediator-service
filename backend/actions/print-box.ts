import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { HOSTNAME, HTTP_PORT } from '../config';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'print-box',
  label: 'Print box label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/box\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const m = req.url?.match(/^\/api\/print\/box\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      const box = ctx.getBox.get(id);
      if (!box) return sendJson(res, 404, { error: 'box not found' });
      const zpl = ctx.zplForBox({ boxId: box.BoxID, location: box.Location || '' });
      let previewUrl = '';
      try {
        const urlToUi = `${HOSTNAME}:${HTTP_PORT}/boxes/${encodeURIComponent(box.BoxID)}`;
        const out = path.join(ctx.PREVIEW_DIR, `box-${box.BoxID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, '_'));
        await ctx.pdfForBox({ boxId: box.BoxID, location: box.Location || '', url: urlToUi, outPath: out });
        previewUrl = `/prints/${path.basename(out)}`;
        ctx.logEvent.run({ Actor: null, EntityType: 'Box', EntityId: box.BoxID, Event: 'PrintPreviewSaved', Meta: JSON.stringify({ file: previewUrl }) });
      } catch (err) {
        console.error('Preview generation failed', err);
      }
      const result = await ctx.sendZpl(zpl);
      if (result.sent) {
        ctx.logEvent.run({ Actor: null, EntityType: 'Box', EntityId: box.BoxID, Event: 'PrintSent', Meta: JSON.stringify({ transport: 'tcp' }) });
      }
      return sendJson(res, 200, { sent: !!result.sent, previewUrl, reason: result.reason });
    } catch (err) {
      console.error('Print box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print box API</p></div>'
};

export default action;
