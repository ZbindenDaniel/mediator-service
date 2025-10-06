import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { Item } from '../../models';
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

function extractStemFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const trimmed = filename.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split('?')[0];
  const base = path.posix.basename(withoutQuery);
  if (!base) return null;
  const noExt = base.replace(/\.[^/.]+$/, '');
  if (!noExt) return null;
  const hyphenMatch = noExt.match(/^(.*?)-\d+$/);
  const stem = hyphenMatch ? hyphenMatch[1] : noExt;
  const finalStem = stem.trim();
  return finalStem ? finalStem : null;
}

function deriveExpectedStems(primary?: string | null, artikelNummer?: string | null): Set<string> {
  const stems = new Set<string>();
  const primaryStem = extractStemFromFilename(
    primary && primary.startsWith(MEDIA_PREFIX) ? primary.slice(MEDIA_PREFIX.length) : primary
  );
  if (primaryStem) stems.add(primaryStem);
  if (typeof artikelNummer === 'string') {
    const trimmedArtikel = artikelNummer.trim();
    if (trimmedArtikel) {
      stems.add(trimmedArtikel);
    }
  }
  return stems;
}

export function collectMediaAssets(
  itemId: string,
  primary?: string | null,
  artikelNummer?: string | null
): string[] {
  const assets: string[] = [];
  const seen = new Set<string>();
  const trimmedPrimary = typeof primary === 'string' ? primary.trim() : '';
  const normalisedPrimary =
    trimmedPrimary && trimmedPrimary.startsWith(MEDIA_PREFIX)
      ? trimmedPrimary
      : normaliseMediaReference(itemId, trimmedPrimary || null);
  pushMedia(assets, normalisedPrimary || '', seen);
  const expectedStems = deriveExpectedStems(normalisedPrimary, artikelNummer);

  try {
    const dir = path.join(MEDIA_DIR, itemId);
    if (fs.existsSync(dir)) {
      const stat = fs.statSync(dir);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(dir).sort();
        const matchingEntries =
          expectedStems.size > 0
            ? entries.filter((entry) => {
                const stem = extractStemFromFilename(entry);
                return !!stem && expectedStems.has(stem);
              })
            : entries;
        const entriesToPush =
          expectedStems.size > 0 && matchingEntries.length === 0 ? entries : matchingEntries;
        if (entriesToPush === entries && matchingEntries.length === 0 && entries.length > 0 && expectedStems.size > 0) {
          console.info('Falling back to legacy media listing', {
            itemId,
            expectedStems: Array.from(expectedStems)
          });
        }
        for (const entry of entriesToPush) {
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
        const media = collectMediaAssets(itemId, normalisedGrafikname, item.Artikel_Nummer);
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
      const existing = ctx.getItem.get(itemId) || {};
      let grafik = existing.Grafikname || '';
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
      const { picture1, picture2, picture3, BoxID: incomingBoxId, ...rest } = data;
      const selectedBoxId = incomingBoxId !== undefined ? incomingBoxId : existing.BoxID;
      let normalizedBoxId: string | null = null;
      if (selectedBoxId !== undefined && selectedBoxId !== null) {
        const trimmedBoxId = String(selectedBoxId).trim();
        if (trimmedBoxId) {
          normalizedBoxId = trimmedBoxId;
        } else {
          console.info('Normalised blank BoxID to null', {
            itemId,
            previousBoxId: existing.BoxID,
            receivedBoxId: incomingBoxId
          });
        }
      }
      const item: Item = {
        ...existing,
        ...rest,
        Grafikname: normalisedGrafikname ?? undefined,
        ItemUUID: itemId,
        BoxID: normalizedBoxId,
        UpdatedAt: new Date()
      };
      const txn = ctx.db.transaction((it: Item, a: string) => {
        ctx.persistItemWithinTransaction(it);
        ctx.logEvent.run({
          Actor: a,
          EntityType: 'Item',
          EntityId: it.ItemUUID,
          Event: 'updated',
          Meta: null
        });
      });
      txn(item, actor);
      const media = collectMediaAssets(itemId, normalisedGrafikname, item.Artikel_Nummer);
      sendJson(res, 200, { ok: true, media });
    } catch (err) {
      console.error('Save item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Item update API</p></div>'
};

export default action;
