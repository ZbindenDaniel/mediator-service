import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
// TODO(agent): Replace legacy Langtext print fallback once structured payload rendering lands.
// TODO(agent): Document HTML print artifacts so support can trace failures quickly.
// TODO(agent): Monitor ignored template query logs while the 29x90 item label remains fixed.
import type { Item } from '../../models';
import type { ItemLabelPayload } from '../lib/labelHtml';
import type { PrintFileResult } from '../print';
import { buildItemCategoryLookups } from 'frontend/src/lib/categoryLookup';

// TODO(agent): Align item print payloads with upcoming label size templates.
// TODO(agent): Promote template selection to UI once multiple label sizes ship.
// TODO(agent): Remove legacy template query fallbacks once all clients request 29x90 directly.
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

function logUnexpectedTemplateQuery(req: IncomingMessage): void {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const raw = url.searchParams.get('template');
    if (raw && raw !== '29x90') {
      console.warn('[label] Unexpected label template requested for item print', { template: raw });
    }
    if (raw) console.warn('Unexpected label template requested for item print', raw);
  } catch (err) {
    console.error('Failed to inspect label template from item print query', err);
  }
}

function resolveCategoryLabel(rawCategory: unknown): string {
  if (rawCategory === null || rawCategory === undefined || rawCategory === '') return '';
  try {
    const lookup = buildItemCategoryLookups();
    const categoryCode = typeof rawCategory === 'number' ? rawCategory : Number(rawCategory);
    if (Number.isFinite(categoryCode)) {
      const entry = lookup.unter.get(categoryCode);
      if (entry?.label) return entry.label;
    }
  } catch (err) {
    console.error('Failed to resolve category label for item print', err);
  }
  return String(rawCategory);
}

const action = defineHttpAction({
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
      logUnexpectedTemplateQuery(req);
      const quantityRaw = item.Auf_Lager as unknown;
      let parsedQuantity = 0;
      if (typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)) {
        parsedQuantity = quantityRaw;
      } else if (typeof quantityRaw === 'string') {
        const parsed = Number.parseFloat(quantityRaw);
        if (Number.isFinite(parsed)) parsedQuantity = parsed;
      }

      const toIsoString = (value: unknown): string | null => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value as string);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };

      const categoryLabel = resolveCategoryLabel(item.Unterkategorien_A);
      const itemData: ItemLabelPayload = {
        type: 'item',
        id: item.ItemUUID,
        labelText: item.Artikelbeschreibung?.trim() || item.ItemUUID,
        materialNumber: item.Artikel_Nummer?.trim() || null,
        boxId: item.BoxID || null,
        location: item.Location?.trim() || null,
        category: categoryLabel,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : null,
        addedAt: toIsoString(item.Datum_erfasst || item.UpdatedAt),
        updatedAt: toIsoString(item.UpdatedAt)
      };
      let previewUrl = '';
      let htmlPath = '';
      try {
        htmlPath = path
          .join(ctx.PREVIEW_DIR, `item-${item.ItemUUID}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_'));
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        await ctx.htmlForItem({ itemData, outPath: htmlPath });
        previewUrl = `/prints/${path.basename(htmlPath)}`;
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
          htmlPath
        });
      } catch (err) {
        console.error('Preview generation failed', err);
        return sendJson(res, 500, { error: 'preview_generation_failed' });
      }

      let printResult: PrintFileResult = { sent: false, reason: 'print_not_attempted' };
      try {
        printResult = await ctx.printFile({
          filePath: htmlPath,
          jobName: `Item ${item.ItemUUID}`,
          renderMode: 'html-to-pdf'
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
          Meta: JSON.stringify({ transport: 'pdf', file: previewUrl, artifact: printResult.artifactPath })
        });
      } else {
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: item.ItemUUID,
          Event: 'PrintFailed',
          Meta: JSON.stringify({
            transport: 'pdf',
            file: previewUrl,
            artifact: printResult.artifactPath,
            reason: printResult.reason
          })
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
});

export default action;
