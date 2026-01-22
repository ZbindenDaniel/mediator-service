import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { Box, Item } from '../../models';
import { ItemEinheit, normalizeItemEinheit } from '../../models';
import {
  canonicalizeCategoryLabel,
  getCategoryLabelFromCode,
  getSubcategoryLabelFromCode,
  itemCategories
} from '../../models';
import type { BoxLabelPayload, ItemLabelPayload, ShelfLabelPayload } from '../lib/labelHtml';
import { htmlForSmallItem } from '../lib/labelHtml';
import type { PrintFileResult, PrintLabelType } from '../print';
import { resolvePrinterQueue } from '../print';
import { buildItemCategoryLookups } from '../../models/item-category-lookups';

const LABEL_TEMPLATES: Record<PrintLabelType, string> = {
  box: '62x100',
  item: '29x90',
  smallitem: '62x12',
  shelf: 'shelf-a4'
};

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

// TODO(agent): Keep label type parsing aligned with frontend label selection prompts.
function parseLabelType(raw: string): PrintLabelType | null {
  if (raw === 'box' || raw === 'item' || raw === 'smallitem' || raw === 'shelf') {
    return raw;
  }
  return null;
}

function logUnexpectedTemplateQuery(
  req: IncomingMessage,
  labelType: PrintLabelType,
  expectedTemplate: string,
  logContext: Record<string, unknown>
): void {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const raw = url.searchParams.get('template');
    if (raw && raw !== expectedTemplate) {
      console.warn('[label] Unexpected label template requested', {
        ...logContext,
        labelType,
        expectedTemplate,
        template: raw
      });
    }
    if (raw) {
      console.warn('Unexpected label template requested', { ...logContext, labelType, template: raw });
    }
  } catch (err) {
    console.error('Failed to inspect label template from print query', { ...logContext, labelType, error: err });
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
  console.error('[print-unified] Failed to build shelf category lookup', err);
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
    try {
      const numeric = Number.parseInt(rawSegment, 10);
      const fromSubcategory = Number.isFinite(numeric) ? getSubcategoryLabelFromCode(numeric) : undefined;
      if (fromSubcategory) {
        return { label: fromSubcategory, source: 'subcategory_code_lookup', segment: rawSegment };
      }
      const fromCategory = Number.isFinite(numeric) ? getCategoryLabelFromCode(numeric) : undefined;
      if (fromCategory) {
        return { label: fromCategory, source: 'category_code_lookup', segment: rawSegment };
      }
    } catch (error) {
      console.error('[print-unified] Failed to parse shelf category segment', { shelfId, error });
    }
  }

  const fromLabel = shelfCategoryLookup.get(rawSegment);
  if (fromLabel) {
    return { label: fromLabel, source: 'label_lookup', segment: rawSegment };
  }

  return { label: rawSegment, source: 'segment_fallback', segment: rawSegment };
}

// TODO(print-unified): consider caching item category lookups if this becomes a hot path.
function resolveCategoryLabel(
  rawCategory: unknown,
  context: { labelType: PrintLabelType; itemId: string }
): string {
  if (rawCategory === null || rawCategory === undefined || rawCategory === '') return '';
  try {
    const lookup = buildItemCategoryLookups();
    const categoryCode = typeof rawCategory === 'number' ? rawCategory : Number(rawCategory);
    if (Number.isFinite(categoryCode)) {
      const entry = lookup.unter.get(categoryCode);
      if (entry?.label) return entry.label;
    }
  } catch (err) {
    console.error('Failed to resolve category label for item print', {
      ...context,
      error: err
    });
  }
  return String(rawCategory);
}

// TODO(agent): Evaluate whether item label quantities should omit counts for instance items in future label templates.
function resolveEinheit(value: unknown, itemId: string): ItemEinheit | null {
  try {
    return normalizeItemEinheit(value);
  } catch (error) {
    console.error('[print-unified] Failed to normalize Einheit', { itemId, error });
    return null;
  }
}

function parseAufLagerValue(value: unknown, itemId: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.error('[print-unified] Failed to parse Auf_Lager', { itemId, value, error });
      return 0;
    }
  }
  return 0;
}

function resolveItemQuantity(item: Item): number {
  const itemId = item.ItemUUID;
  const einheit = resolveEinheit(item.Einheit, itemId);
  const parsedAufLager = parseAufLagerValue(item.Auf_Lager, itemId);
  if (einheit !== ItemEinheit.Menge && parsedAufLager > 1) {
    console.warn('[print-unified] Instance item has Auf_Lager > 1', {
      itemId,
      artikelNumber: item.Artikel_Nummer ?? null,
      aufLager: parsedAufLager
    });
  }
  return einheit === ItemEinheit.Menge ? parsedAufLager : 1;
}

function computeTotalQuantity(items: Item[]): number {
  return items.reduce((sum, item) => sum + resolveItemQuantity(item), 0);
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildBoxLabelPayload(box: Box, items: Item[]): BoxLabelPayload {
  const totalQuantity = computeTotalQuantity(items);
  return {
    type: 'box',
    id: box.BoxID,
    labelText: box.BoxID,
    location: box.LocationId?.trim() || null,
    standortLabel: box.Label?.trim() || null,
    description: box.Notes?.trim() || null,
    quantity: Number.isFinite(totalQuantity) ? totalQuantity : null,
    itemCount: items.length
  };
}

function buildItemLabelPayload(item: Item): ItemLabelPayload {
  const parsedQuantity = resolveItemQuantity(item);

  const categoryLabel = resolveCategoryLabel(item.Unterkategorien_A, {
    labelType: 'item',
    itemId: item.ItemUUID
  });
  // TODO(agent): Consider passing Einheit metadata into label payloads for bulk/instance diagnostics.
  return {
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
}

function buildShelfLabelPayload(box: Box): ShelfLabelPayload {
  const shelfSegments = parseShelfIdSegments(box.BoxID);
  const shelfCategory = resolveShelfCategoryLabel(box.BoxID);
  return {
    type: 'shelf',
    id: box.BoxID,
    shelfId: box.BoxID,
    labelText: box.Label?.trim() || null,
    category: shelfCategory.label ?? null,
    categoryLabel: shelfCategory.label ?? null,
    location: shelfSegments?.location ?? null,
    floor: shelfSegments?.floor ?? null
  };
}

function resolveInvalidIdMessage(labelType: PrintLabelType): string {
  switch (labelType) {
    case 'box':
      return 'invalid box id';
    case 'item':
    case 'smallitem':
      return 'invalid item id';
    case 'shelf':
      return 'invalid shelf id';
    default:
      return 'invalid id';
  }
}

function resolveNotFoundMessage(labelType: PrintLabelType): string {
  switch (labelType) {
    case 'box':
      return 'box not found';
    case 'item':
    case 'smallitem':
      return 'item not found';
    case 'shelf':
      return 'shelf not found';
    default:
      return 'not found';
  }
}

export interface PrintRequestOptions {
  labelTypeOverride?: PrintLabelType;
}

export async function handleUnifiedPrintRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: any,
  options: PrintRequestOptions = {}
): Promise<void> {
  try {
    const match = req.url?.match(/^\/api\/print\/([^/]+)\/([^/]+)$/);
    const pathLabelTypeRaw = match ? decodeURIComponent(match[1]) : '';
    const pathLabelType = parseLabelType(pathLabelTypeRaw);
    const labelType = options.labelTypeOverride ?? pathLabelType;
    if (!labelType) {
      return sendJson(res, 400, { error: 'invalid label type' });
    }

    const id = match ? decodeURIComponent(match[2]) : '';
    if (!id) {
      return sendJson(res, 400, { error: resolveInvalidIdMessage(labelType) });
    }

    let actor = '';
    try {
      const body = await readRequestBody(req);
      if (!body.length) {
        return sendJson(res, 400, { error: 'actor required' });
      }
      let payload: { actor?: unknown; labelType?: unknown };
      try {
        payload = JSON.parse(body.toString() || '{}');
      } catch (err) {
        console.error('Invalid JSON payload for print request', { labelType, entityId: id, actor, error: err });
        return sendJson(res, 400, { error: 'invalid json' });
      }
      if (payload.labelType !== undefined) {
        if (typeof payload.labelType !== 'string') {
          console.error('Invalid labelType for print request', { labelType, entityId: id, actor, value: payload.labelType });
          return sendJson(res, 400, { error: 'invalid label type' });
        }
        const parsedLabelType = parseLabelType(payload.labelType);
        if (!parsedLabelType || parsedLabelType !== labelType) {
          console.error('Mismatched labelType for print request', {
            labelType,
            entityId: id,
            actor,
            requested: payload.labelType
          });
          return sendJson(res, 400, { error: 'invalid label type' });
        }
      }
      if (typeof payload.actor !== 'string') {
        return sendJson(res, 400, { error: 'actor required' });
      }
      actor = payload.actor.trim();
      if (!actor) {
        return sendJson(res, 400, { error: 'actor required' });
      }
    } catch (bodyErr) {
      console.error('Failed to parse request body for print', { labelType, entityId: id, actor, error: bodyErr });
      return sendJson(res, 400, { error: 'invalid body' });
    }

    const logContext = { labelType, entityId: id, actor };
    console.info('[print-unified] Template selected', {
      ...logContext,
      template: LABEL_TEMPLATES[labelType]
    });
    logUnexpectedTemplateQuery(req, labelType, LABEL_TEMPLATES[labelType], logContext);

    let previewUrl = '';
    let htmlPath = '';
    let payload: BoxLabelPayload | ItemLabelPayload | ShelfLabelPayload;
    let entityType: 'Box' | 'Item';
    let entityId: string;

    try {
      if (labelType === 'item' || labelType === 'smallitem') {
        const item = ctx.getItem.get(id) as Item | undefined;
        if (!item) return sendJson(res, 404, { error: resolveNotFoundMessage(labelType) });
        payload = buildItemLabelPayload(item);
        entityType = 'Item';
        entityId = item.ItemUUID;
      } else {
        const box = ctx.getBox.get(id) as Box | undefined;
        if (!box) return sendJson(res, 404, { error: resolveNotFoundMessage(labelType) });
        if (labelType === 'shelf' && !box.BoxID.startsWith('S-')) {
          console.warn('[print-unified] Shelf print requested for non-shelf box id', {
            ...logContext,
            boxId: box.BoxID
          });
          return sendJson(res, 400, { error: resolveInvalidIdMessage(labelType) });
        }
        if (labelType === 'box' && box.BoxID.startsWith('S-')) {
          console.warn('[print-unified] Box label requested for shelf id', {
            ...logContext,
            boxId: box.BoxID
          });
        }
        const items = labelType === 'box'
          ? ((ctx.itemsByBox?.all(box.BoxID) as Item[] | undefined) || [])
          : [];
        if (labelType === 'box') {
          payload = buildBoxLabelPayload(box, items);
        } else {
          payload = buildShelfLabelPayload(box);
          const shelfCategory = resolveShelfCategoryLabel(box.BoxID);
          console.info('[print-unified] Resolved shelf category', {
            ...logContext,
            boxId: box.BoxID,
            category: shelfCategory?.label,
            source: shelfCategory?.source,
            segment: shelfCategory?.segment
          });
        }
        entityType = 'Box';
        entityId = box.BoxID;
      }
    } catch (payloadErr) {
      console.error('Failed to build label payload', { ...logContext, error: payloadErr });
      return sendJson(res, 500, { error: 'label_payload_failed' });
    }

    const labelPayload = payload;
    try {
      htmlPath = path
        .join(ctx.PREVIEW_DIR, `${labelType}-${entityId}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_'));
      fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

      if (labelType === 'box') {
        await ctx.htmlForBox({ boxData: labelPayload as BoxLabelPayload, outPath: htmlPath });
      } else if (labelType === 'item') {
        await ctx.htmlForItem({ itemData: labelPayload as ItemLabelPayload, outPath: htmlPath });
      } else if (labelType === 'smallitem') {
        await htmlForSmallItem({ itemData: labelPayload as ItemLabelPayload, outPath: htmlPath });
      } else {
        await ctx.htmlForShelf({ shelfData: labelPayload as ShelfLabelPayload, outPath: htmlPath });
      }

      previewUrl = `/prints/${path.basename(htmlPath)}`;
      ctx.logEvent({
        Actor: actor,
        EntityType: entityType,
        EntityId: entityId,
        Event: 'PrintPreviewSaved',
        Meta: JSON.stringify({ file: previewUrl, labelType, qrPayload: labelPayload })
      });
      console.log('Label preview generated', {
        ...logContext,
        previewUrl,
        htmlPath,
        qrPayload: labelPayload
      });
    } catch (err) {
      console.error('Preview generation failed', { ...logContext, error: err });
      return sendJson(res, 500, { error: 'preview_generation_failed' });
    }

    let printResult: PrintFileResult = { sent: false, reason: 'print_not_attempted' };
    const queueResolution = resolvePrinterQueue(labelType);
    if (queueResolution.source === 'missing') {
      console.warn('[print-unified] Printer queue missing for label type', { ...logContext });
    }
    try {
      const jobName = labelType === 'item'
        ? `Item ${entityId}`
        : labelType === 'smallitem'
          ? `Small Item ${entityId}`
          : labelType === 'shelf'
            ? `Shelf ${entityId}`
            : `Box ${entityId}`;
      printResult = await ctx.printFile({
        filePath: htmlPath,
        jobName,
        renderMode: 'html-to-pdf',
        printerQueue: queueResolution.queue
      });
    } catch (err) {
      console.error('Label print invocation failed', { ...logContext, error: err });
      printResult = { sent: false, reason: (err as Error).message };
    }

    if (printResult.sent) {
      ctx.logEvent({
        Actor: actor,
        EntityType: entityType,
        EntityId: entityId,
        Event: 'PrintSent',
        Meta: JSON.stringify({
          transport: 'pdf',
          file: previewUrl,
          artifact: printResult.artifactPath,
          labelType
        })
      });
    } else {
      ctx.logEvent({
        Actor: actor,
        EntityType: entityType,
        EntityId: entityId,
        Event: 'PrintFailed',
        Meta: JSON.stringify({
          transport: 'pdf',
          file: previewUrl,
          artifact: printResult.artifactPath,
          reason: printResult.reason,
          labelType
        })
      });
    }

    return sendJson(res, 200, {
      sent: !!printResult.sent,
      previewUrl,
      reason: printResult.reason,
      qrPayload: labelPayload
    });
  } catch (err) {
    console.error('Unified print action failed', err);
    sendJson(res, 500, { error: (err as Error).message });
  }
}

const action = defineHttpAction({
  key: 'print-unified',
  label: 'Print label (unified)',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/print\/(box|item|smallitem|shelf)\/[^/]+$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    await handleUnifiedPrintRequest(req, res, ctx);
  },
  view: () => '<div class="card"><p class="muted">Print label API</p></div>'
});

export default action;
