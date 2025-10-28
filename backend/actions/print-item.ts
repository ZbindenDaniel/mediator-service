import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { Item } from '../../models';
import type { ItemLabelPayload } from '../labelpdf';
import type { PrintPdfResult } from '../print';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

const action: Action = {
  key: 'print-item',
  label: 'Print item label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/item\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let actor = '';
      try {
        const body = await readRequestBody(req);
        if (!body.length) {
          return sendJson(res, 400, { error: 'actor required' });
        }
        let payload: { actor?: unknown };
        try {
          payload = JSON.parse(body.toString() || '{}');
        } catch (err) {
          console.error('Invalid JSON payload for item print request', err);
          return sendJson(res, 400, { error: 'invalid json' });
        }
        if (typeof payload.actor !== 'string') {
          return sendJson(res, 400, { error: 'actor required' });
        }
        actor = payload.actor.trim();
        if (!actor) {
          return sendJson(res, 400, { error: 'actor required' });
        }
      } catch (bodyErr) {
        console.error('Failed to parse request body for item print', bodyErr);
        return sendJson(res, 400, { error: 'invalid body' });
      }

      const m = req.url?.match(/^\/api\/print\/item\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid item id' });
      const item = ctx.getItem.get(id) as Item | undefined;
      if (!item) return sendJson(res, 404, { error: 'item not found' });
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
      let pdfPath = '';
      try {
        pdfPath = path
          .join(ctx.PREVIEW_DIR, `item-${item.ItemUUID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, '_'));
        fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
        await ctx.pdfForItem({ itemData, outPath: pdfPath });
        previewUrl = `/prints/${path.basename(pdfPath)}`;
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintPreviewSaved',
          Meta: JSON.stringify({ file: previewUrl, qrPayload: itemData })
        });
        console.log('Item label preview generated', {
          itemId: item.ItemUUID,
          previewUrl,
          qrPayload: itemData,
          pdfPath
        });
      } catch (err) {
        console.error('Preview generation failed', err);
        return sendJson(res, 500, { error: 'preview_generation_failed' });
      }

      let printResult: PrintPdfResult = { sent: false, reason: 'print_not_attempted' };
      try {
        printResult = await ctx.printPdf({
          filePath: pdfPath,
          jobName: `Item ${item.ItemUUID}`
        });
      } catch (err) {
        console.error('Item label print invocation failed', { itemId: item.ItemUUID, error: err });
        printResult = { sent: false, reason: (err as Error).message };
      }

      if (printResult.sent) {
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintSent',
          Meta: JSON.stringify({ transport: 'pdf', file: previewUrl })
        });
      } else {
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintFailed',
          Meta: JSON.stringify({ transport: 'pdf', file: previewUrl, reason: printResult.reason })
        });
      }

      return sendJson(res, 200, {
        sent: !!printResult.sent,
        previewUrl,
        reason: printResult.reason,
        qrPayload: itemData
      });
    } catch (err) {
      console.error('Print item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print item API</p></div>'
};

export default action;
