// TODO(agent): add action tests.
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { ItemEinheit, normalizeItemEinheit } from '../../models';
import type { AgenticRun, Item, ItemInstanceSummary, ItemRef } from '../../models';
import { normalizeQuality } from '../../models/quality';
import { defineHttpAction } from './index';
import { formatArtikelNummerForMedia, MEDIA_DIR, resolveMediaFolder } from '../lib/media';
import { generateShopwareCorrelationId } from '../db';

const MEDIA_PREFIX = '/media/';
// TODO(item-detail-reference): Confirm reference payload expectations once API consumers update.
// TODO(agent): Centralize media asset validation to avoid shipping document artifacts alongside images.
// TODO(agent): Revisit allowed media extensions when new asset types need exporting.
// TODO(agent): Align item instance summary fields with detail UI once instance list usage expands.
// TODO(agent): Monitor zero-stock instance warnings to confirm detail filters stay aligned with list policy.
// TODO(reference-only-edit): Keep edit payload guards aligned with instance/reference field boundaries.
// TODO(suchbegriff-guard): Reconfirm Suchbegriff update guard stays aligned with import/update flows.
// TODO(einheit-immutability): Keep Einheit immutable in edit payloads while legacy clients update.
const ALLOWED_MEDIA_EXTENSIONS = new Set<string>([
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

export function isAllowedMediaAsset(candidate: string | null | undefined): boolean {
  if (!candidate) {
    return false;
  }

  const [withoutQuery] = candidate.split('?');
  const ext = path.posix.extname(withoutQuery.toLowerCase());
  return ALLOWED_MEDIA_EXTENSIONS.has(ext);
}

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

function normaliseMediaReference(
  itemId: string,
  artikelNummer: string | null | undefined,
  value?: string | null
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mediaFolder = resolveMediaFolder(itemId, artikelNummer, console);

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

  pushCandidate(buildRelativePath(`${mediaFolder}/${cleaned}`));
  pushCandidate(buildRelativePath(cleaned));
  const baseName = path.posix.basename(cleaned);
  pushCandidate(buildRelativePath(`${mediaFolder}/${baseName}`));
  if (mediaFolder !== itemId) {
    pushCandidate(buildRelativePath(`${itemId}/${cleaned}`));
    pushCandidate(buildRelativePath(`${itemId}/${baseName}`));
  }

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

// TODO(media-enumeration): Confirm non-image files never leak into media folders once new sources are added.

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
      : normaliseMediaReference(itemId, artikelNummer, trimmedPrimary || null);
  if (normalisedPrimary && !isAllowedMediaAsset(normalisedPrimary)) {
    console.info('[save-item] Skipping non-image media asset from Grafikname', {
      itemId,
      candidate: normalisedPrimary,
    });
  } else {
    pushMedia(assets, normalisedPrimary || '', seen);
  }

  try {
    const mediaFolder = resolveMediaFolder(itemId, artikelNummer, console);
    const foldersToScan = mediaFolder === itemId ? [mediaFolder] : [mediaFolder, itemId];
    for (const folder of foldersToScan) {
      const dir = path.join(MEDIA_DIR, folder);
      if (!fs.existsSync(dir)) {
        continue;
      }
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        continue;
      }
      const entries = fs.readdirSync(dir).sort();
      const mediaEntries = entries.filter((entry) => {
        const resolvedPath = `${MEDIA_PREFIX}${folder}/${entry}`;
        if (!isAllowedMediaAsset(entry)) {
          console.info('[save-item] Skipping non-image media asset from media directory', {
            itemId,
            entry: resolvedPath,
          });
          return false;
        }
        return true;
      });
      if (folder !== mediaFolder && mediaEntries.length > 0) {
        console.info('[save-item] Found legacy media folder assets', { itemId, folder });
      }
      for (const entry of mediaEntries) {
        const resolved = `${MEDIA_PREFIX}${folder}/${entry}`;
        pushMedia(assets, resolved, seen);
      }
    }
  } catch (err) {
    console.error('Failed to enumerate media assets', { itemId, error: err });
  }

  return assets;
}

function removeItemMediaAsset(itemId: string, asset: string): boolean {
  const trimmed = typeof asset === 'string' ? asset.trim() : '';
  if (!trimmed) {
    return false;
  }
  const relativeCandidate = trimmed.startsWith(MEDIA_PREFIX) ? trimmed.slice(MEDIA_PREFIX.length) : trimmed;
  const relative = buildRelativePath(relativeCandidate);
  if (!relative) {
    console.warn('[save-item] Skipped removing media asset with unsafe relative path', {
      itemId,
      asset: trimmed
    });
    return false;
  }
  try {
    const absolute = path.join(MEDIA_DIR, relative);
    if (!absolute.startsWith(MEDIA_DIR)) {
      console.warn('[save-item] Refused to remove media asset outside MEDIA_DIR', {
        itemId,
        asset: trimmed,
        resolved: absolute
      });
      return false;
    }
    if (!fs.existsSync(absolute)) {
      console.info('[save-item] Media asset already removed', { itemId, asset: trimmed });
      return false;
    }
    fs.unlinkSync(absolute);
    console.info('[save-item] Removed media asset during item update', { itemId, asset: trimmed });
    return true;
  } catch (err) {
    console.error('[save-item] Failed to remove media asset during item update', { itemId, asset: trimmed, err });
    return false;
  }
}

function pruneEmptyItemMediaDirectory(itemId: string, artikelNummer?: string | null): void {
  try {
    const mediaFolder = resolveMediaFolder(itemId, artikelNummer, console);
    const foldersToCheck = mediaFolder === itemId ? [mediaFolder] : [mediaFolder, itemId];
    for (const folder of foldersToCheck) {
      const dir = path.join(MEDIA_DIR, folder);
      if (!fs.existsSync(dir)) {
        continue;
      }
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        continue;
      }
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        console.info('[save-item] Removed empty media directory after update', { itemId, folder });
      }
    }
  } catch (err) {
    console.error('[save-item] Failed to prune empty media directory', { itemId, err });
  }
}

type CategoryFieldName =
  | 'Hauptkategorien_A'
  | 'Unterkategorien_A'
  | 'Hauptkategorien_B'
  | 'Unterkategorien_B';

function normaliseCategoryValue(
  itemId: string,
  field: CategoryFieldName,
  rawValue: unknown
): number | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  try {
    if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) {
        console.warn('[save-item] Encountered non-finite numeric category value', {
          itemId,
          field,
          value: rawValue
        });
        return null;
      }
      if (!Number.isInteger(rawValue)) {
        const truncated = Math.trunc(rawValue);
        console.warn('[save-item] Truncated non-integer category value to integer', {
          itemId,
          field,
          original: rawValue,
          normalised: truncated
        });
        return truncated;
      }
      return rawValue;
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) {
        console.warn('[save-item] Failed to parse category value from string', {
          itemId,
          field,
          value: trimmed
        });
        return null;
      }
      if (trimmed !== String(parsed)) {
        console.info('[save-item] Normalised category string to integer value', {
          itemId,
          field,
          original: rawValue,
          normalised: parsed
        });
      }
      return parsed;
    }

    console.warn('[save-item] Unsupported category value type encountered', {
      itemId,
      field,
      valueType: typeof rawValue
    });
  } catch (error) {
    console.error('[save-item] Unexpected failure while normalising category value', {
      itemId,
      field,
      value: rawValue,
      error
    });
  }

  return null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const DEFAULT_ITEM_EINHEIT: ItemEinheit = ItemEinheit.Stk;

function resolveItemQualityValue(value: unknown, context: string): number | null {
  try {
    const candidate = value ?? null;
    return normalizeQuality(candidate, console);
  } catch (error) {
    console.error('[save-item] Failed to normalize quality value; leaving unset.', { context, error });
    return null;
  }
}

function resolveShopartikelFlag(value: unknown, quality: number | null): number {
  const derivedFlag = quality !== null && quality < 3 ? 0 : 1;
  try {
    if (value === undefined || value === null || value === '') {
      if (quality === null) {
        console.warn('[save-item] Shopartikel value missing with unknown quality; using fallback', { value });
      }
      return derivedFlag;
    }

    const numericValue = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue >= 1 ? 1 : 0;
    }

    console.warn('[save-item] Unexpected Shopartikel value; deriving from quality', { value, quality });
    return derivedFlag;
  } catch (error) {
    console.error('[save-item] Failed to resolve Shopartikel flag; deriving from quality', { value, quality, error });
    return derivedFlag;
  }
}

function resolveItemEinheitValue(value: unknown, context: string): ItemEinheit {
  try {
    const normalized = normalizeItemEinheit(value);
    if (normalized) {
      return normalized;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      console.warn('[save-item] Invalid Einheit encountered; falling back to default.', {
        context,
        provided: value
      });
    } else if (value !== null && value !== undefined) {
      console.warn('[save-item] Unexpected Einheit type encountered; falling back to default.', {
        context,
        providedType: typeof value
      });
    }
  } catch (error) {
    console.error('[save-item] Failed to resolve Einheit value; using default.', {
      context,
      error
    });
  }
  return DEFAULT_ITEM_EINHEIT;
}

function normalizeSearchTerm(
  value: unknown,
  context: { itemId: string; artikelNummer: string }
): string | null {
  // TODO(agentic-search-term): Revisit Suchbegriff normalization once UI edit flow persists it directly.
  try {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  } catch (error) {
    console.error('[save-item] Failed to normalize Suchbegriff value', {
      itemId: context.itemId,
      artikelNummer: context.artikelNummer,
      error
    });
    return null;
  }
}

const action = defineHttpAction({
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
        let agentic: AgenticRun | null = null;
        try {
          agentic = ctx.getAgenticRun ? ((ctx.getAgenticRun.get(itemId) as AgenticRun | undefined) ?? null) : null;
        } catch (error) {
          console.error('[save-item] Failed to load agentic run for item detail', { itemId, error });
          agentic = null;
        }
        const normalisedGrafikname = normaliseMediaReference(itemId, item.Artikel_Nummer, item.Grafikname);
        const media = collectMediaAssets(itemId, normalisedGrafikname, item.Artikel_Nummer);
        const sanitizedItem = {
          ...item,
          Einheit: resolveItemEinheitValue(item.Einheit, 'fetchResponse'),
          Quality: resolveItemQualityValue(item.Quality, 'fetchResponse')
        };
        // TODO(stock-visibility): Verify Auf_Lager instance summary data feeds withdrawal availability.
        let instances: ItemInstanceSummary[] = [];
        try {
          if (item.Artikel_Nummer && ctx.findByMaterial?.all) {
            const rawInstances = ctx.findByMaterial.all(item.Artikel_Nummer) as Item[] | undefined;
            if (Array.isArray(rawInstances)) {
              const normalizedInstances: ItemInstanceSummary[] = [];
              let zeroStockCount = 0;
              for (const instance of rawInstances) {
                const itemUUID =
                  typeof instance?.ItemUUID === 'string' ? instance.ItemUUID.trim() : '';
                if (!itemUUID) {
                  console.warn('[save-item] Missing ItemUUID in instance list', {
                    itemId,
                    artikelNummer: item.Artikel_Nummer
                  });
                  continue;
                }
                let parsedStock: number | null = null;
                try {
                  const rawStock = instance?.Auf_Lager ?? null;
                  if (rawStock === null || rawStock === undefined) {
                    console.warn('[save-item] Missing Auf_Lager in instance list', {
                      itemId,
                      artikelNummer: item.Artikel_Nummer,
                      itemUUID
                    });
                  } else {
                    parsedStock = typeof rawStock === 'number' ? rawStock : Number(rawStock);
                    if (Number.isNaN(parsedStock)) {
                      console.warn('[save-item] Non-numeric Auf_Lager in instance list', {
                        itemId,
                        artikelNummer: item.Artikel_Nummer,
                        itemUUID,
                        provided: rawStock
                      });
                      parsedStock = null;
                    }
                  }
                } catch (error) {
                  console.error('[save-item] Failed to parse Auf_Lager in instance list', {
                    itemId,
                    artikelNummer: item.Artikel_Nummer,
                    itemUUID,
                    error
                  });
                  parsedStock = null;
                }
                if (parsedStock !== null && parsedStock <= 0) {
                  zeroStockCount += 1;
                }
                // TODO(agentic-instance-status): Keep instance list agentic statuses aligned with ItemUUID-based runs.
                normalizedInstances.push({
                  ItemUUID: itemUUID,
                  AgenticStatus: instance.AgenticStatus ?? null,
                  Quality: resolveItemQualityValue(instance.Quality, 'fetchInstance'),
                  Auf_Lager: instance.Auf_Lager ?? null,
                  Location: instance.Location ?? null,
                  BoxID: instance.BoxID ?? null,
                  UpdatedAt: instance.UpdatedAt ? String(instance.UpdatedAt) : null,
                  Datum_erfasst: instance.Datum_erfasst ? String(instance.Datum_erfasst) : null
                });
              }
              if (zeroStockCount > 0) {
                console.warn('[save-item] Instance list includes zero-stock entries', {
                  itemId,
                  artikelNummer: item.Artikel_Nummer,
                  zeroStockCount
                });
              }
              instances = normalizedInstances;
            } else {
              console.warn('[save-item] Instance list is not an array', {
                itemId,
                artikelNummer: item.Artikel_Nummer
              });
            }
          } else if (item.Artikel_Nummer) {
            console.warn('[save-item] Missing findByMaterial helper for instance list', {
              itemId,
              artikelNummer: item.Artikel_Nummer
            });
          }
        } catch (error) {
          console.error('[save-item] Failed to resolve instance list for item detail', {
            itemId,
            artikelNummer: item.Artikel_Nummer ?? null,
            error
          });
        }
        let reference: ItemRef | null = null;
        let artikelNummer = '';
        try {
          artikelNummer = typeof item.Artikel_Nummer === 'string' ? item.Artikel_Nummer.trim() : '';
          if (!artikelNummer) {
            console.warn('[save-item] Missing Artikel_Nummer for reference lookup', { itemId });
          } else if (!ctx.getItemReference?.get) {
            console.warn('[save-item] Missing getItemReference helper for reference lookup', { itemId, artikelNummer });
          } else {
            reference = (ctx.getItemReference.get(artikelNummer) as ItemRef | undefined) ?? null;
            if (!reference) {
              console.warn('[save-item] Missing reference for Artikel_Nummer', { itemId, artikelNummer });
            }
          }
        } catch (error) {
          console.error('[save-item] Failed to resolve item reference for detail payload', {
            itemId,
            artikelNummer: artikelNummer || null,
            error
          });
        }
        const normalisedCategories = {
          Hauptkategorien_A: normaliseCategoryValue(itemId, 'Hauptkategorien_A', sanitizedItem.Hauptkategorien_A),
          Unterkategorien_A: normaliseCategoryValue(itemId, 'Unterkategorien_A', sanitizedItem.Unterkategorien_A),
          Hauptkategorien_B: normaliseCategoryValue(itemId, 'Hauptkategorien_B', sanitizedItem.Hauptkategorien_B),
          Unterkategorien_B: normaliseCategoryValue(itemId, 'Unterkategorien_B', sanitizedItem.Unterkategorien_B)
        };
        const hasCategoryMetadata = Object.values(normalisedCategories).some((value) => value !== null);
        if (!hasCategoryMetadata) {
          console.warn('[save-item] Category metadata missing for fetched item', {
            itemId,
            artikelNummer: sanitizedItem.Artikel_Nummer ?? null
          });
        }
        const itemWithCategories = { ...sanitizedItem, ...normalisedCategories };
        const responseItem =
          normalisedGrafikname && normalisedGrafikname !== sanitizedItem.Grafikname
            ? { ...itemWithCategories, Grafikname: normalisedGrafikname }
            : itemWithCategories;
        return sendJson(res, 200, { item: responseItem, reference, box, events, agentic, media, instances });
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
      const mediaArtikelNummer = data.Artikel_Nummer || existing.Artikel_Nummer || null;
      let grafik = existing.Grafikname || '';
      try {
        const imgs = [data.picture1, data.picture2, data.picture3];
        // TODO(media-delete): Add coverage for removeAsset payload handling.
        const normalisedExistingGrafik = normaliseMediaReference(
          itemId,
          mediaArtikelNummer,
          existing.Grafikname
        );
        const existingMediaBeforeUpdate = collectMediaAssets(
          itemId,
          normalisedExistingGrafik,
          mediaArtikelNummer
        );
        const removalSlots = imgs.reduce<number[]>((acc, value, index) => {
          if (value === null) {
            acc.push(index);
          }
          return acc;
        }, []);
        const assetsToRemove = new Set<string>();
        const removeAssetRaw = typeof data.removeAsset === 'string' ? data.removeAsset.trim() : '';
        if (removeAssetRaw) {
          const normalisedRemoveAsset =
            normaliseMediaReference(itemId, mediaArtikelNummer, removeAssetRaw) ?? removeAssetRaw;
          if (normalisedRemoveAsset.startsWith(MEDIA_PREFIX)) {
            assetsToRemove.add(normalisedRemoveAsset);
          } else {
            console.warn('[save-item] Skipped removeAsset outside media prefix', {
              itemId,
              removeAsset: removeAssetRaw
            });
          }
        }

        if (removalSlots.length > 0 || assetsToRemove.size > 0) {
          let removedCount = 0;
          for (const slot of removalSlots) {
            const asset = existingMediaBeforeUpdate[slot];
            if (asset) {
              assetsToRemove.add(asset);
            }
          }
          for (const asset of assetsToRemove) {
            if (removeItemMediaAsset(itemId, asset)) {
              removedCount += 1;
            }
          }
          if (removalSlots.includes(0)) {
            grafik = '';
          }
          if (normalisedExistingGrafik && assetsToRemove.has(normalisedExistingGrafik)) {
            grafik = '';
          }
          if (removedCount > 0) {
            console.info('[save-item] Processed item photo removals', { itemId, removedCount });
          }
        }

        const uploads: Array<{ index: number; dataUrl: string }> = [];
        imgs.forEach((img, idx) => {
          if (typeof img !== 'string') {
            return;
          }
          const trimmed = img.trim();
          if (!trimmed) {
            return;
          }
          if (!/^data:image\//i.test(trimmed)) {
            return;
          }
          uploads.push({ index: idx, dataUrl: trimmed });
        });

        if (uploads.length > 0) {
          const resolvedArtikelNummer = formatArtikelNummerForMedia(mediaArtikelNummer, console);
          const mediaFolder = resolveMediaFolder(itemId, resolvedArtikelNummer, console);
          const dir = path.join(MEDIA_DIR, mediaFolder);
          const artNr = resolvedArtikelNummer || mediaFolder;
          fs.mkdirSync(dir, { recursive: true });
          uploads.forEach(({ index, dataUrl }) => {
            const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (!match) {
              console.warn('[save-item] Skipped non data-url photo upload payload', { itemId, index });
              return;
            }
            const ext = match[1].split('/')[1] || 'png';
            const buf = Buffer.from(match[2], 'base64');
            const file = `${artNr}-${index + 1}.${ext}`;
            try {
              fs.writeFileSync(path.join(dir, file), buf);
              if (index === 0) {
                grafik = `${MEDIA_PREFIX}${mediaFolder}/${file}`;
              }
            } catch (writeErr) {
              console.error('Failed to persist media file', {
                itemId,
                file,
                error: writeErr
              });
            }
          });
        }

        pruneEmptyItemMediaDirectory(itemId, mediaArtikelNummer);
      } catch (e) {
        console.error('Failed to save item images', e);
      }
      let normalisedGrafikname = normaliseMediaReference(itemId, mediaArtikelNummer, grafik);
      if (!normalisedGrafikname) {
        const fallbackMedia = collectMediaAssets(
          itemId,
          null,
          mediaArtikelNummer
        );
        if (fallbackMedia.length > 0) {
          const fallbackPrimary = fallbackMedia[0];
          normalisedGrafikname = normaliseMediaReference(itemId, mediaArtikelNummer, fallbackPrimary) ?? fallbackPrimary;
          grafik = normalisedGrafikname ?? '';
          console.info('[save-item] Updated primary graphic after removals', {
            itemId,
            fallbackPrimary
          });
        }
      }
      const ignoredInstanceFields = [
        'BoxID',
        'Location',
        'UpdatedAt',
        'Datum_erfasst',
        'Auf_Lager',
        'ShopwareVariantId',
        'ItemUUID'
      ];
      const ignoredPayloadFields = ignoredInstanceFields.filter((field) =>
        Object.prototype.hasOwnProperty.call(data, field)
      );
      if (ignoredPayloadFields.length > 0) {
        console.info('[save-item] Ignored instance-only fields in edit payload', {
          itemId,
          fields: ignoredPayloadFields
        });
      }
      const referencePayload = { ...data } as Record<string, unknown>;
      ignoredPayloadFields.forEach((field) => {
        delete referencePayload[field];
      });
      if (Object.prototype.hasOwnProperty.call(referencePayload, 'Einheit')) {
        console.info('[save-item] Ignoring Einheit update in edit payload', {
          itemId,
          provided: (referencePayload as Partial<ItemRef>).Einheit ?? null,
          existing: existing.Einheit ?? null
        });
        delete referencePayload.Einheit;
      }
      const incomingQuality = (referencePayload as Partial<ItemRef>).Quality;
      const incomingShopartikel = (referencePayload as Partial<ItemRef>).Shopartikel;
      const incomingArtikelNummer =
        typeof referencePayload.Artikel_Nummer === 'string' ? referencePayload.Artikel_Nummer.trim() : '';
      const fallbackArtikelNummer =
        typeof existing.Artikel_Nummer === 'string' ? existing.Artikel_Nummer.trim() : '';
      const artikelNummer = incomingArtikelNummer || fallbackArtikelNummer;
      if (!artikelNummer) {
        console.error('[save-item] Missing Artikel_Nummer for reference update', { itemId });
        return sendJson(res, 400, { error: 'Artikel_Nummer is required for reference update' });
      }
      let existingReference: ItemRef | null = null;
      try {
        if (ctx.getItemReference?.get) {
          existingReference = (ctx.getItemReference.get(artikelNummer) as ItemRef | undefined) ?? null;
        } else {
          console.warn('[save-item] Missing getItemReference helper for reference update', { itemId, artikelNummer });
        }
      } catch (error) {
        console.error('[save-item] Failed to load existing item reference', { itemId, artikelNummer, error });
      }
      const existingSuchbegriff =
        typeof existingReference?.Suchbegriff === 'string' ? existingReference.Suchbegriff.trim() : '';
      if (Object.prototype.hasOwnProperty.call(referencePayload, 'Suchbegriff') && existingSuchbegriff) {
        console.info('[save-item] Ignoring Suchbegriff update for existing reference', {
          itemId,
          artikelNummer,
          existingSuchbegriff,
          incomingSuchbegriff: referencePayload.Suchbegriff ?? null
        });
        delete referencePayload.Suchbegriff;
      }
      const referenceBase: ItemRef = existingReference ?? {
        Artikel_Nummer: artikelNummer,
        Einheit: existing.Einheit ?? undefined
      };
      const referenceUpdates: Partial<ItemRef> = {};
      const referenceFieldKeys: Array<keyof ItemRef> = [
        'Suchbegriff',
        'Grafikname',
        'ImageNames',
        'Artikelbeschreibung',
        'Verkaufspreis',
        'Kurzbeschreibung',
        'Langtext',
        'Hersteller',
        'Länge_mm',
        'Breite_mm',
        'Höhe_mm',
        'Gewicht_kg',
        'Hauptkategorien_A',
        'Unterkategorien_A',
        'Hauptkategorien_B',
        'Unterkategorien_B',
        'Veröffentlicht_Status',
        'Shopartikel',
        'Artikeltyp',
        'Einheit',
        'EntityType',
        'ShopwareProductId',
        'Quality'
      ];
      referenceFieldKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(referencePayload, key)) {
          (referenceUpdates as Record<string, unknown>)[key] = referencePayload[key];
        }
      });
      if (Object.prototype.hasOwnProperty.call(referencePayload, 'Suchbegriff')) {
        const normalized = normalizeSearchTerm(referencePayload.Suchbegriff, {
          itemId,
          artikelNummer
        });
        referenceUpdates.Suchbegriff = normalized ?? undefined;
      }
      const resolvedQuality =
        incomingQuality !== undefined
          ? resolveItemQualityValue(incomingQuality, 'updatePayload')
          : resolveItemQualityValue(referenceBase.Quality ?? null, 'existingReference');
      if (Object.prototype.hasOwnProperty.call(referencePayload, 'Quality')) {
        referenceUpdates.Quality = resolvedQuality;
      }
      if (Object.prototype.hasOwnProperty.call(referencePayload, 'Shopartikel')) {
        referenceUpdates.Shopartikel = resolveShopartikelFlag(incomingShopartikel, resolvedQuality);
      }
      const resolvedGrafikname = normalisedGrafikname ?? undefined;
      referenceUpdates.Grafikname = resolvedGrafikname;
      const reference: ItemRef = {
        ...referenceBase,
        ...referenceUpdates,
        Artikel_Nummer: artikelNummer
      };
      const txn = ctx.db.transaction((ref: ItemRef, a: string) => {
        ctx.persistItemReference(ref);
        ctx.logEvent({
          Actor: a,
          EntityType: 'Item',
          EntityId: itemId,
          Event: 'Updated',
          Meta: null
        });
        try {
          const correlationId = generateShopwareCorrelationId('save-item', itemId);
          const payload = JSON.stringify({
            actor: a,
            artikelNummer: ref.Artikel_Nummer ?? null,
            boxId: existing.BoxID ?? null,
            location: existing.Location ?? null,
            itemUUID: itemId,
            trigger: 'save-item'
          });
          ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'item-upsert',
            Payload: payload
          });
        } catch (queueErr) {
          console.error('[save-item] Failed to enqueue Shopware sync job', {
            itemId,
            error: queueErr
          });
        }
      });
      try {
        txn(reference, actor);
      } catch (error) {
        console.error('[save-item] Failed to persist item reference update', { itemId, artikelNummer, error });
        return sendJson(res, 500, { error: 'Failed to persist item reference' });
      }
      const media = collectMediaAssets(itemId, normalisedGrafikname, reference.Artikel_Nummer);
      sendJson(res, 200, { ok: true, media });
    } catch (err) {
      console.error('Save item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Item update API</p></div>'
});

export default action;
