import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Box, Item } from '../../models';
import type { BoxLabelPayload } from '../labelpdf';

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
      const box = ctx.getBox.get(id) as Box | undefined;
      if (!box) return sendJson(res, 404, { error: 'box not found' });
      const zpl = ctx.zplForBox({ boxId: box.BoxID, location: box.Location || '' });

      const items = (ctx.itemsByBox?.all(box.BoxID) as Item[] | undefined) || [];
      const totalQuantity = items.reduce((sum, item) => {
        const raw = (item as Item)?.Auf_Lager as unknown;
        if (typeof raw === 'number' && Number.isFinite(raw)) return sum + raw;
        if (typeof raw === 'string') {
          const parsed = Number.parseFloat(raw);
          if (Number.isFinite(parsed)) return sum + parsed;
        }
        return sum;
      }, 0);

      const boxData: BoxLabelPayload = {
        type: 'box',
        id: box.BoxID,
        location: box.Location?.trim() || null,
        standortLabel: box.StandortLabel?.trim() || null,
        description: box.Notes?.trim() || null,
        quantity: Number.isFinite(totalQuantity) ? totalQuantity : null,
        itemCount: items.length
      };

      let previewUrl = '';
      try {
        const out = path.join(ctx.PREVIEW_DIR, `box-${box.BoxID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, '_'));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await ctx.pdfForBox({ boxData, outPath: out });
        previewUrl = `/prints/${path.basename(out)}`;
        ctx.logEvent.run({ Actor: null, EntityType: 'Box', EntityId: box.BoxID, Event: 'PrintPreviewSaved', Meta: JSON.stringify({ file: previewUrl, qrPayload: boxData }) });
        console.log('Box label preview generated', { boxId: box.BoxID, previewUrl, qrPayload: boxData });
      } catch (err) {
        console.error('Preview generation failed', err);
      }
      const result = await ctx.sendZpl(zpl);
      if (result.sent) {
        ctx.logEvent.run({ Actor: null, EntityType: 'Box', EntityId: box.BoxID, Event: 'PrintSent', Meta: JSON.stringify({ transport: 'tcp' }) });
      }
      return sendJson(res, 200, { sent: !!result.sent, previewUrl, reason: result.reason, qrPayload: boxData });
    } catch (err) {
      console.error('Print box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print box API</p></div>'
};

export default action;
