import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import type { ItemQuant, ItemRecord, ItemRef } from '../../models';
import { normaliseItemQuant } from '../../models';
import type { Action } from './index';

const MEDIA_PREFIX = '/media/';
const MEDIA_DIR = path.join(__dirname, '../../media');

function pushMedia(target: string[], value: string | null | undefined, seen: Set<string>): void {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (seen.has(trimmed)) return;
  target.push(trimmed);
  seen.add(trimmed);
}

function buildRelativePath(relative: string): string | null {
  if (!relative) return null;
  const normalised = path.posix.normalize(relative.replace(/\\/g, '/'));
  if (!normalised || normalised === '.' || normalised.startsWith('..')) {
    return null;
  }
  return normalised;
}

function mediaExists(relative: string): boolean {
  try {
    const absolute = path.join(MEDIA_DIR, relative);
    if (!absolute.startsWith(MEDIA_DIR)) {
      console.warn('Refused to check media path outside MEDIA_DIR', { relative });
      return false;
    }
    return fs.existsSync(absolute);
  } catch (err) {
    console.error('Failed to check media existence', { relative, error: err });
    return false;
  }
}

function normaliseMediaReference(itemId: string, value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith(MEDIA_PREFIX)) {
    const relativeRaw = trimmed.slice(MEDIA_PREFIX.length);
    const relative = buildRelativePath(relativeRaw);
    if (!relative) {
      console.warn('Media asset discarded due to unsafe relative path', {
        itemId,
        candidate: trimmed
      });
      return null;
    }
    if (!mediaExists(relative)) {
      console.warn('Media asset missing on disk', {
        itemId,
        candidate: trimmed,
        attemptedPath: path.join(MEDIA_DIR, relative)
      });
    }
    return `${MEDIA_PREFIX}${relative}`;
  }

  const cleaned = trimmed.replace(/^\/+/g, '').replace(/\\/g, '/');
  const candidates: string[] = [];
  const pushCandidate = (relative: string | null) => {
    if (!relative) return;
    if (!candidates.includes(relative)) {
      candidates.push(relative);
    }
  };

  pushCandidate(buildRelativePath(`${itemId}/${cleaned}`));
  pushCandidate(buildRelativePath(cleaned));
  const baseName = path.posix.basename(cleaned);
  pushCandidate(buildRelativePath(`${itemId}/${baseName}`));

  for (const relative of candidates) {
    if (mediaExists(relative)) {
      return `${MEDIA_PREFIX}${relative}`;
    }
  }

  if (candidates.length > 0) {
    console.warn('Media asset missing on disk', {
      itemId,
      candidate: trimmed,
      attemptedPath: path.join(MEDIA_DIR, candidates[0])
    });
    return `${MEDIA_PREFIX}${candidates[0]}`;
  }

  console.warn('Media asset missing on disk', { itemId, candidate: trimmed });
  return trimmed;
}

export function collectMediaAssets(itemId: string, primary?: string | null): string[] {
  const assets: string[] = [];
  const seen = new Set<string>();
  const trimmedPrimary = typeof primary === 'string' ? primary.trim() : '';
  const normalisedPrimary =
    trimmedPrimary && trimmedPrimary.startsWith(MEDIA_PREFIX)
      ? trimmedPrimary
      : normaliseMediaReference(itemId, trimmedPrimary || null);
  pushMedia(assets, normalisedPrimary || '', seen);

  try {
    const dir = path.join(MEDIA_DIR, itemId);
    if (fs.existsSync(dir)) {
      const stat = fs.statSync(dir);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(dir).sort();
        for (const entry of entries) {
          const resolved = `${MEDIA_PREFIX}${itemId}/${entry}`;
          pushMedia(assets, resolved, seen);
        }
      }
    }
  } catch (err) {
    console.error('Failed to enumerate media assets', { itemId, error: err });
  }

  return assets;
}

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
        const agentic = ctx.getAgenticRun ? ctx.getAgenticRun.get(itemId) : null;
        const normalisedGrafikname = normaliseMediaReference(itemId, item.Grafikname);
        const media = collectMediaAssets(itemId, normalisedGrafikname);
        const responseItem =
          normalisedGrafikname && normalisedGrafikname !== item.Grafikname
            ? { ...item, Grafikname: normalisedGrafikname }
            : item;
        return sendJson(res, 200, { item: responseItem, box, events, agentic, media });
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
      const existing = (ctx.getItem.get(itemId) as Partial<ItemRecord>) || {};
      const existingQuant = normaliseItemQuant(existing as Partial<ItemQuant>);
      let grafik = (existing as ItemRef)?.Grafikname || '';
      try {
        const imgs = [data.picture1, data.picture2, data.picture3];
        const dir = path.join(MEDIA_DIR, itemId);
        const artNr = data.Artikel_Nummer || existing.Artikel_Nummer || itemId;
        if (imgs.some((i: string) => i)) fs.mkdirSync(dir, { recursive: true });
        imgs.forEach((img: string, idx: number) => {
          if (!img) return;
          const m = (img as string).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${artNr}-${idx + 1}.${ext}`;
          try {
            fs.writeFileSync(path.join(dir, file), buf);
            if (idx === 0) grafik = `${MEDIA_PREFIX}${itemId}/${file}`;
          } catch (writeErr) {
            console.error('Failed to persist media file', {
              itemId,
              file,
              error: writeErr
            });
          }
        });
      } catch (e) {
        console.error('Failed to save item images', e);
      }
      const normalisedGrafikname = normaliseMediaReference(itemId, grafik);
      const { picture1, picture2, picture3, ...rest } = data;
      const {
        BoxID: boxIdRaw,
        Location: locationRaw,
        Auf_Lager: quantityRaw,
        Datum_erfasst: recordedAtRaw,
        UpdatedAt: _ignoreUpdatedAt,
        ...refPayload
      } = rest;

      const resolvedBoxId =
        typeof boxIdRaw === 'string'
          ? boxIdRaw.trim() || null
          : boxIdRaw === null
          ? null
          : existingQuant?.BoxID ?? null;

      const resolvedLocation =
        typeof locationRaw === 'string'
          ? locationRaw.trim() || existingQuant?.Location
          : existingQuant?.Location;

      let resolvedQuantity: number | undefined = existingQuant?.Auf_Lager;
      if (typeof quantityRaw === 'number') {
        resolvedQuantity = quantityRaw;
      } else if (typeof quantityRaw === 'string') {
        const parsed = Number(quantityRaw);
        if (Number.isFinite(parsed)) {
          resolvedQuantity = parsed;
        } else {
          console.warn('save-item: quantity payload not numeric', { itemId, quantityRaw });
        }
      }

      let resolvedRecordedAt: Date | undefined = existingQuant?.Datum_erfasst;
      if (recordedAtRaw) {
        const parsed = recordedAtRaw instanceof Date ? recordedAtRaw : new Date(recordedAtRaw);
        if (Number.isNaN(parsed.getTime())) {
          console.warn('save-item: Datum_erfasst payload invalid', { itemId, recordedAtRaw });
        } else {
          resolvedRecordedAt = parsed;
        }
      }

      const quant: ItemQuant = {
        ItemUUID: itemId,
        BoxID: resolvedBoxId ?? null,
        Location: resolvedLocation,
        UpdatedAt: new Date(),
        Datum_erfasst: resolvedRecordedAt,
        Auf_Lager: resolvedQuantity
      };

      const itemRef: ItemRef = {
        ...(existing as ItemRef),
        ...refPayload,
        Grafikname: normalisedGrafikname ?? undefined,
        ItemUUID: itemId
      };

      const item: ItemRecord = { ...itemRef, ...quant };
      const txn = ctx.db.transaction((it: ItemRecord, a: string) => {
        ctx.upsertItemRecord(it);
        ctx.logEvent.run({
          Actor: a,
          EntityType: 'Item',
          EntityId: it.ItemUUID,
          Event: 'updated',
          Meta: null
        });
      });
      txn(item, actor);
      const media = collectMediaAssets(itemId, normalisedGrafikname);
      sendJson(res, 200, { ok: true, media });
    } catch (err) {
      console.error('Save item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Item update API</p></div>'
};

export default action;
