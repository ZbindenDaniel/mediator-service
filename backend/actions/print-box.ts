import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { Box, Item } from '../../models';
import type { BoxLabelPayload } from '../lib/labelHtml';
import type { PrintFileResult } from '../print';

// TODO(agent): Surface label size enforcement in UI once additional templates exist.
// TODO(agent): Capture HTML label previews to help debug print regressions.
// TODO(agent): Track rejected template query attempts while only 62x100 is permitted.
// TODO(agent): Remove legacy template query fallbacks once all clients request 62x100 directly.
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
    if (raw && raw !== '62x100') {
      console.warn('[label] Unexpected label template requested for box print', { template: raw });
    }
    if (raw) console.warn('Unexpected label template requested for box print', raw);
  } catch (err) {
    console.error('Failed to inspect label template from box print query', err);
  }
}

const action = defineHttpAction({
  key: 'print-box',
  label: 'Print box label',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/box\/[^/]+$/.test(p) && m === 'POST',
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
          console.error('Invalid JSON payload for box print request', err);
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
        console.error('Failed to parse request body for box print', bodyErr);
        return sendJson(res, 400, { error: 'invalid body' });
      }

      const m = req.url?.match(/^\/api\/print\/box\/([^/]+)$/);
      const id = m ? decodeURIComponent(m[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      const box = ctx.getBox.get(id) as Box | undefined;
      if (!box) return sendJson(res, 404, { error: 'box not found' });
      const items = (ctx.itemsByBox?.all(box.BoxID) as Item[] | undefined) || [];
      logUnexpectedTemplateQuery(req);
      const totalQuantity = items.reduce((sum, item) => {
        const raw = (item as Item)?.Auf_Lager as unknown;
        if (typeof raw === 'number' && Number.isFinite(raw)) return sum + raw;
        if (typeof raw === 'string') {
          const parsed = Number.parseFloat(raw);
          if (Number.isFinite(parsed)) return sum + parsed;
        }
        return sum;
      }, 0);

      const template = '62x100';
      const boxData: BoxLabelPayload = {
        type: 'box',
        id: box.BoxID,
        labelText: box.BoxID,
        location: box.LocationId?.trim() || null,
        standortLabel: box.Label?.trim() || null,
        description: box.Notes?.trim() || null,
        quantity: Number.isFinite(totalQuantity) ? totalQuantity : null,
        itemCount: items.length
      };

      let previewUrl = '';
      let htmlPath = '';
      try {
        htmlPath = path
          .join(ctx.PREVIEW_DIR, `box-${box.BoxID}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_'));
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        await ctx.htmlForBox({ boxData, outPath: htmlPath });
        previewUrl = `/prints/${path.basename(htmlPath)}`;
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Box',
          EntityId: box.BoxID,
          Event: 'PrintPreviewSaved',
          Meta: JSON.stringify({ file: previewUrl, qrPayload: boxData })
        });
        console.log('Box label preview generated', {
          boxId: box.BoxID,
          previewUrl,
          qrPayload: boxData,
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
          jobName: `Box ${box.BoxID}`,
          renderMode: 'html-to-pdf'
        });
      } catch (err) {
        console.error('Box label print invocation failed', { boxId: box.BoxID, error: err });
        printResult = { sent: false, reason: (err as Error).message };
      }

      if (printResult.sent) {
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Box',
          EntityId: box.BoxID,
          Event: 'PrintSent',
          Meta: JSON.stringify({ transport: 'pdf', file: previewUrl, artifact: printResult.artifactPath })
        });
      } else {
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Box',
          EntityId: box.BoxID,
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
        qrPayload: boxData
      });
    } catch (err) {
      console.error('Print box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Print box API</p></div>'
});

export default action;
