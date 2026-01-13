import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { Box, Item } from '../../models';
import { canonicalizeCategoryLabel, getCategoryLabelFromCode, itemCategories } from '../../models';
import type { BoxLabelPayload, ShelfLabelPayload } from '../lib/labelHtml';
import type { PrintFileResult } from '../print';

// TODO(agent): Surface label size enforcement in UI once additional templates exist.
// TODO(agent): Capture HTML label previews to help debug print regressions.
// TODO(agent): Track rejected template query attempts while only 62x100 is permitted.
// TODO(agent): Remove legacy template query fallbacks once all clients request 62x100 directly.
// TODO(agent): Confirm shelf category mapping once shelf ID schema changes are confirmed.
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

const shelfCategoryLookup = new Map<string, string>();
try {
  for (const category of itemCategories) {
    const canonicalLabel = canonicalizeCategoryLabel(category.label).toUpperCase();
    if (!shelfCategoryLookup.has(canonicalLabel)) {
      shelfCategoryLookup.set(canonicalLabel, category.label);
    }
  }
} catch (err) {
  console.error('[print-box] Failed to build shelf category lookup', err);
}

function parseShelfIdSegments(shelfId: string): {
  location: string;
  floor: string;
  category: string;
  index: string;
} | null {
  const match = shelfId.match(/^S-([A-Z0-9_]+)-([A-Z0-9_]+)-([A-Z0-9_]+)-([A-Z0-9_]+)$/i);
  if (!match) return null;
  return {
    location: match[1].toUpperCase(),
    floor: match[2].toUpperCase(),
    category: match[3].toUpperCase(),
    index: match[4].toUpperCase()
  };
}

function resolveShelfCategoryLabel(shelfId: string): { label: string | null; source: string; segment: string | null } {
  const segments = parseShelfIdSegments(shelfId);
  if (!segments) {
    return { label: null, source: 'missing_segments', segment: null };
  }

  const rawSegment = segments.category;
  if (/^\d+$/.test(rawSegment)) {
    const numeric = Number.parseInt(rawSegment, 10);
    const fromCode = Number.isFinite(numeric) ? getCategoryLabelFromCode(numeric) : undefined;
    if (fromCode) {
      return { label: fromCode, source: 'code_lookup', segment: rawSegment };
    }
  }

  const fromLabel = shelfCategoryLookup.get(rawSegment);
  if (fromLabel) {
    return { label: fromLabel, source: 'label_lookup', segment: rawSegment };
  }

  return { label: rawSegment, source: 'segment_fallback', segment: rawSegment };
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
      const isShelf = box.BoxID.startsWith('S-');
      console.info('[print-box] Template selected', {
        boxId: box.BoxID,
        labelType: isShelf ? 'shelf' : 'box',
        template: isShelf ? 'shelf-a4' : '62x100'
      });
      logUnexpectedTemplateQuery(req);
      const items = isShelf ? [] : (ctx.itemsByBox?.all(box.BoxID) as Item[] | undefined) || [];

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
        labelText: box.BoxID,
        location: box.LocationId?.trim() || null,
        standortLabel: box.Label?.trim() || null,
        description: box.Notes?.trim() || null,
        quantity: Number.isFinite(totalQuantity) ? totalQuantity : null,
        itemCount: items.length
      };

      const shelfSegments = isShelf ? parseShelfIdSegments(box.BoxID) : null;
      const shelfCategory = isShelf ? resolveShelfCategoryLabel(box.BoxID) : null;
      if (isShelf) {
        console.info('[print-box] Resolved shelf category', {
          boxId: box.BoxID,
          category: shelfCategory?.label,
          source: shelfCategory?.source,
          segment: shelfCategory?.segment
        });
      }
      const shelfData: ShelfLabelPayload | null = isShelf
        ? {
            type: 'shelf',
            id: box.BoxID,
            shelfId: box.BoxID,
            labelText: box.Label?.trim() || null,
            category: shelfCategory?.label ?? null,
            categoryLabel: shelfCategory?.label ?? null,
            location: shelfSegments?.location ?? null,
            floor: shelfSegments?.floor ?? null
          }
        : null;

      let previewUrl = '';
      let htmlPath = '';
      try {
        htmlPath = path
          .join(
            ctx.PREVIEW_DIR,
            `${isShelf ? 'shelf' : 'box'}-${box.BoxID}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_')
          );
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        if (isShelf && shelfData) {
          await ctx.htmlForShelf({ shelfData, outPath: htmlPath });
        } else {
          await ctx.htmlForBox({ boxData, outPath: htmlPath });
        }
        previewUrl = `/prints/${path.basename(htmlPath)}`;
        ctx.logEvent({
          Actor: actor,
          EntityType: 'Box',
          EntityId: box.BoxID,
          Event: 'PrintPreviewSaved',
          Meta: JSON.stringify({ file: previewUrl, qrPayload: isShelf && shelfData ? shelfData : boxData })
        });
        console.log('Label preview generated', {
          boxId: box.BoxID,
          labelType: isShelf ? 'shelf' : 'box',
          template: isShelf ? 'shelf-a4' : '62x100',
          previewUrl,
          qrPayload: isShelf && shelfData ? shelfData : boxData,
          htmlPath
        });
      } catch (err) {
        console.error('[print-box] Preview generation failed', {
          boxId: box.BoxID,
          labelType: isShelf ? 'shelf' : 'box',
          template: isShelf ? 'shelf-a4' : '62x100',
          error: err
        });
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
