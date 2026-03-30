// TODO(agent): add action tests.
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { ItemEinheit, normalizeItemEinheit } from '../../models';
import type { AgenticRun, Item, ItemDetailResponse, ItemInstanceSummary, ItemRef } from '../../models';
import { normalizeQuality } from '../../models/quality';
import { defineHttpAction } from './index';
import {
  formatArtikelNummerForMedia,
  MEDIA_UPLOAD_STAGING_DIR,
  resolveMediaFolder,
  resolveUploadMediaPath
} from '../lib/media';
import { emitMediaAudit } from '../lib/media-audit';
import { assertPathWithinRoot, resolvePathWithinRoot } from '../lib/path-guard';
import { generateShopwareCorrelationId } from '../db';
import { attachTranscriptReference } from '../agentic';
import { loadSubcategoryReviewAutomationSignals } from '../agentic/review-automation-signals';
import { listRecentAgenticRunReviewHistoryBySubcategory } from '../db';

const MEDIA_PREFIX = '/media/';
// TODO(item-detail-reference): Confirm reference payload expectations once API consumers update.
// TODO(agent): Centralize media asset validation to avoid shipping document artifacts alongside images.
// TODO(agent): Revisit allowed media extensions when new asset types need exporting.
// TODO(agent): Align item instance summary fields with detail UI once instance list usage expands.
// TODO(agent): Monitor zero-stock instance warnings to confirm detail filters stay aligned with list policy.
// TODO(agentic-transcript-save-item): Keep transcript attachment aligned with agentic service helper.
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
  if (path.isAbsolute(relative)) return null;
  const normalised = path.posix.normalize(relative.replace(/\\/g, '/'));
  if (!normalised || normalised === '.' || normalised.startsWith('..')) {
    return null;
  }
  return normalised;
}

function mediaExists(
  itemId: string,
  artikelNummer: string | null | undefined,
  relative: string
): boolean {
  try {
    const absolute = resolvePathWithinRoot(MEDIA_UPLOAD_STAGING_DIR, relative, {
      logger: console,
      operation: 'save-item:media-exists'
    });
    if (!absolute) {
      console.warn('[save-item] Media path blocked by guard', {
        itemId,
        artikelNummer: artikelNummer ?? null,
        relative,
        outcome: 'blocked'
      });
      return false;
    }
    return fs.existsSync(absolute);
  } catch (err) {
    console.error('[save-item] Failed to check media existence', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      relative,
      error: err
    });
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

  if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
    console.warn('[save-item] Media reference discarded due to unsupported URL', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      candidate: trimmed
    });
    return null;
  }

  let relativeRaw = trimmed;
  if (trimmed.startsWith(MEDIA_PREFIX)) {
    relativeRaw = trimmed.slice(MEDIA_PREFIX.length);
  } else if (trimmed.startsWith('/')) {
    console.warn('[save-item] Media reference discarded due to unsupported absolute path', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      candidate: trimmed
    });
    return null;
  } else if (!trimmed.includes('/') && !trimmed.includes('\\')) {
    const formattedArtikelNummer = formatArtikelNummerForMedia(artikelNummer ?? null, console);
    const mediaFolder = resolveMediaFolder(itemId, formattedArtikelNummer, console);
    relativeRaw = `${mediaFolder}/${trimmed}`;
  }

  const relativePath = buildRelativePath(relativeRaw);
  if (!relativePath) {
    console.warn('[save-item] Media asset discarded due to unsafe relative path', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      candidate: trimmed,
      relativePath: relativeRaw
    });
    return null;
  }

  if (!mediaExists(itemId, artikelNummer, relativePath)) {
    console.warn('[save-item] Media asset missing on disk', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      candidate: trimmed,
      attemptedPath: path.join(MEDIA_UPLOAD_STAGING_DIR, relativePath)
    });
  }

  return `${MEDIA_PREFIX}${relativePath}`;
}

function normalizeGrafiknameForPersistence(
  value: unknown,
  context: { itemId: string; artikelNummer: string | null; source: string }
): { shouldUpdate: boolean; value: string | undefined } {
  try {
    if (typeof value !== 'string') {
      return { shouldUpdate: false, value: undefined };
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return { shouldUpdate: true, value: '' };
    }
    const hasPathSeparators = trimmed.includes('/') || trimmed.includes('\\');
    if (hasPathSeparators) {
      console.warn('[save-item] Incoming Grafikname contains path separators; normalizing to basename', {
        itemId: context.itemId,
        artikelNummer: context.artikelNummer,
        source: context.source,
        grafikname: trimmed
      });
    }
    const basename = path.posix.basename(trimmed.replace(/\\/g, '/'));
    if (!basename || basename === '.' || basename === '..') {
      console.warn('[save-item] Incoming Grafikname rejected as unsafe filename token', {
        itemId: context.itemId,
        artikelNummer: context.artikelNummer,
        source: context.source,
        grafikname: trimmed,
        basename
      });
      return { shouldUpdate: false, value: undefined };
    }
    return { shouldUpdate: true, value: basename };
  } catch (error) {
    console.error('[save-item] Failed to normalize Grafikname for persistence', {
      itemId: context.itemId,
      artikelNummer: context.artikelNummer,
      source: context.source,
      grafikname: value,
      error
    });
    return { shouldUpdate: false, value: undefined };
  }
}

// TODO(media-enumeration): Confirm non-image files never leak into media folders once new sources are added.

export function collectMediaAssets(
  itemId: string,
  primary?: string | null,
  artikelNummer?: string | null
): string[] {
  // TODO(media-filtering): Keep legacy folder filtering aligned with Artikel_Nummer rules.
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
    const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
    const formattedArtikelNummer =
      trimmedArtikelNummer ? formatArtikelNummerForMedia(trimmedArtikelNummer, console) : null;
    const artikelPrefixes = new Set<string>();
    if (trimmedArtikelNummer) {
      artikelPrefixes.add(trimmedArtikelNummer);
    }
    if (formattedArtikelNummer && formattedArtikelNummer !== trimmedArtikelNummer) {
      artikelPrefixes.add(formattedArtikelNummer);
    }
    for (const folder of foldersToScan) {
      const dir = resolvePathWithinRoot(MEDIA_UPLOAD_STAGING_DIR, folder, {
        logger: console,
        operation: 'save-item:collect-media-assets'
      });
      if (!dir) {
        continue;
      }
      if (!fs.existsSync(dir)) {
        continue;
      }
      let entries: string[] = [];
      try {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) {
          continue;
        }
        entries = fs.readdirSync(dir).sort();
      } catch (error) {
        console.error('[save-item] Failed to read media directory', { itemId, folder, dir, error });
        continue;
      }
      const shouldFilterByArtikel =
        artikelPrefixes.size > 0 && mediaFolder !== itemId && folder === itemId;
      const mediaEntries = entries.filter((entry) => {
        const resolvedPath = `${MEDIA_PREFIX}${folder}/${entry}`;
        if (!isAllowedMediaAsset(entry)) {
          console.info('[save-item] Skipping non-image media asset from media directory', {
            itemId,
            entry: resolvedPath,
          });
          return false;
        }
        if (shouldFilterByArtikel) {
          const baseName = path.posix.basename(entry);
          const matchesArtikel = Array.from(artikelPrefixes).some((prefix) =>
            baseName.startsWith(prefix)
          );
          if (!matchesArtikel) {
            console.info('[save-item] Skipping legacy media asset for different Artikel_Nummer', {
              itemId,
              entry: resolvedPath,
              artikelNummer: trimmedArtikelNummer || null
            });
            return false;
          }
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

  console.info('[save-item] Collected media assets', {
    itemId,
    artikelNummer: artikelNummer ?? null,
    count: assets.length
  });

  return assets;
}

function removeItemMediaAsset(itemId: string, artikelNummer: string | null | undefined, asset: string): boolean {
  const trimmed = typeof asset === 'string' ? asset.trim() : '';
  if (!trimmed) {
    return false;
  }
  emitMediaAudit({
    action: 'delete',
    scope: 'item',
    identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
    path: trimmed,
    root: MEDIA_UPLOAD_STAGING_DIR,
    outcome: 'start',
    reason: null,
  });
  const relativeCandidate = trimmed.startsWith(MEDIA_PREFIX) ? trimmed.slice(MEDIA_PREFIX.length) : trimmed;
  if (path.isAbsolute(relativeCandidate)) {
    console.warn('[save-item] Rejecting removeAsset attempt targeting non-staging root', {
      itemId,
      artikelNummer: artikelNummer ?? null,
      asset: trimmed,
      stagingRoot: MEDIA_UPLOAD_STAGING_DIR
    });
    emitMediaAudit({
      action: 'delete',
      scope: 'item',
      identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
      path: trimmed,
      root: MEDIA_UPLOAD_STAGING_DIR,
      outcome: 'blocked',
      reason: 'absolute-path',
    });
    return false;
  }
  const relative = buildRelativePath(relativeCandidate);
  if (!relative) {
    emitMediaAudit({
      action: 'delete',
      scope: 'item',
      identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
      path: trimmed,
      root: MEDIA_UPLOAD_STAGING_DIR,
      outcome: 'blocked',
      reason: 'unsafe-relative-path',
    });
    console.warn('[save-item] Skipped removing media asset with unsafe relative path', {
      itemId,
      asset: trimmed
    });
    return false;
  }
  try {
    const absolute = assertPathWithinRoot(MEDIA_UPLOAD_STAGING_DIR, path.resolve(MEDIA_UPLOAD_STAGING_DIR, relative), {
      logger: console,
      operation: 'save-item:remove-media-asset'
    });
    if (!fs.existsSync(absolute)) {
      emitMediaAudit({
        action: 'delete',
        scope: 'item',
        identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
        path: absolute,
        root: MEDIA_UPLOAD_STAGING_DIR,
        outcome: 'blocked',
        reason: 'already-missing',
      });
      console.info('[save-item] Media asset already removed', { itemId, asset: trimmed });
      return false;
    }
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) {
      emitMediaAudit({
        action: 'delete',
        scope: 'item',
        identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
        path: absolute,
        root: MEDIA_UPLOAD_STAGING_DIR,
        outcome: 'blocked',
        reason: 'non-file-target',
      });
      console.warn('[save-item] Skipped removing non-file media asset target', {
        itemId,
        asset: trimmed,
      });
      return false;
    }
    fs.unlinkSync(absolute);
    emitMediaAudit({
      action: 'delete',
      scope: 'item',
      identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
      path: absolute,
      root: MEDIA_UPLOAD_STAGING_DIR,
      outcome: 'success',
      reason: null,
    });
    console.info('[save-item] Removed media asset during item update', { itemId, asset: trimmed });
    return true;
  } catch (err) {
    emitMediaAudit({
      action: 'delete',
      scope: 'item',
      identifier: { itemUUID: itemId, artikelNummer: artikelNummer ?? null },
      path: trimmed,
      root: MEDIA_UPLOAD_STAGING_DIR,
      outcome: 'error',
      reason: 'unlink-failed',
      error: err,
    });
    console.error('[save-item] Failed to remove media asset during item update', { itemId, asset: trimmed, err });
    return false;
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
        let item = (ctx.getItem.get(itemId) as Item | undefined) ?? null;
        let identifierMode: 'itemUUID' | 'artikelNummer' = 'itemUUID';
        let resolvedItemId = itemId;
        let fallbackReference: ItemRef | null = null;
        let fallbackInstances: Item[] = [];

        if (!item) {
          identifierMode = 'artikelNummer';
          try {
            if (ctx.getItemReference?.get) {
              fallbackReference = (ctx.getItemReference.get(itemId) as ItemRef | undefined) ?? null;
            }
            if (ctx.findByMaterial?.all) {
              const materialInstances = ctx.findByMaterial.all(itemId) as Item[] | undefined;
              fallbackInstances = Array.isArray(materialInstances) ? materialInstances : [];
            }
            if (fallbackInstances.length > 0) {
              item = fallbackInstances[0];
              resolvedItemId = item?.ItemUUID || itemId;
            }
            console.info('[save-item] GET detail identifier lookup resolved', {
              identifierMode,
              requestedIdentifier: itemId,
              foundReference: Boolean(fallbackReference),
              instanceCount: fallbackInstances.length
            });
          } catch (error) {
            console.error('[save-item] GET detail fallback identifier lookup failed', {
              identifierMode,
              requestedIdentifier: itemId,
              error,
              stack: error instanceof Error ? error.stack : undefined
            });
            return sendJson(res, 404, { error: 'Not found' });
          }

          if (!item && fallbackReference && fallbackInstances.length === 0) {
            console.warn('[save-item] Reference found without instances for detail lookup', {
              identifierMode,
              requestedIdentifier: itemId,
              artikelNummer: fallbackReference.Artikel_Nummer
            });
            const referenceBackedItem: Item = {
              ItemUUID: itemId,
              BoxID: null,
              Location: null,
              ShelfLabel: null,
              UpdatedAt: new Date(0),
              Datum_erfasst: undefined,
              ...fallbackReference,
              Auf_Lager: undefined
            };
            const refArtikelNummer = (fallbackReference.Artikel_Nummer ?? itemId).trim();
            let refAgentic: AgenticRun | null = null;
            try {
              refAgentic = ctx.getAgenticRun && refArtikelNummer
                ? ((ctx.getAgenticRun.get(refArtikelNummer) as AgenticRun | undefined) ?? null)
                : null;
              if (refAgentic) {
                refAgentic = attachTranscriptReference(refAgentic, refArtikelNummer, console);
              }
            } catch (error) {
              console.error('[save-item] Failed to load agentic run for reference-only item', {
                itemId,
                refArtikelNummer,
                error
              });
            }
            return sendJson(res, 200, {
              item: referenceBackedItem,
              reference: fallbackReference,
              box: null,
              events: [],
              agentic: refAgentic,
              agenticReviewAutomation: null,
              media: collectMediaAssets(itemId, fallbackReference.Grafikname, fallbackReference.Artikel_Nummer),
              instances: []
            });
          }
        }

        if (!item) return sendJson(res, 404, { error: 'Not found' });

        const box = ctx.getBox.get(item.BoxID);
        const events = ctx.listEventsForItem.all(resolvedItemId);
        console.info('[save-item] GET detail identifier mode in use', {
          identifierMode,
          requestedIdentifier: itemId
        });
        let agentic: AgenticRun | null = null;
        let agenticArtikelNummer = '';
        try {
          agenticArtikelNummer = typeof item.Artikel_Nummer === 'string' ? item.Artikel_Nummer.trim() : '';
          if (!agenticArtikelNummer) {
            console.warn('[save-item] Missing Artikel_Nummer for agentic run lookup', { itemId });
          }
          agentic = ctx.getAgenticRun && agenticArtikelNummer
            ? ((ctx.getAgenticRun.get(agenticArtikelNummer) as AgenticRun | undefined) ?? null)
            : null;
          if (agentic) {
            try {
              agentic = attachTranscriptReference(agentic, agenticArtikelNummer, console);
            } catch (error) {
              console.error('[save-item] Failed to attach transcript reference to agentic run', {
                itemId,
                artikelNummer: agenticArtikelNummer,
                error
              });
            }
          }
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
                  Auf_Lager: instance.Auf_Lager ?? undefined,
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
          Hauptkategorien_A: normaliseCategoryValue(itemId, 'Hauptkategorien_A', sanitizedItem.Hauptkategorien_A) ?? undefined,
          Unterkategorien_A: normaliseCategoryValue(itemId, 'Unterkategorien_A', sanitizedItem.Unterkategorien_A) ?? undefined,
          Hauptkategorien_B: normaliseCategoryValue(itemId, 'Hauptkategorien_B', sanitizedItem.Hauptkategorien_B) ?? undefined,
          Unterkategorien_B: normaliseCategoryValue(itemId, 'Unterkategorien_B', sanitizedItem.Unterkategorien_B) ?? undefined
        };
        const hasCategoryMetadata = Object.values(normalisedCategories).some((value) => value !== null);
        if (!hasCategoryMetadata) {
          console.warn('[save-item] Category metadata missing for fetched item', {
            itemId,
            artikelNummer: sanitizedItem.Artikel_Nummer ?? null
          });
        }
        const itemWithCategories = { ...sanitizedItem, ...normalisedCategories };
        // TODO(agentic-card-metrics): Keep agent card metrics payload lean while preserving denominator context.
        let agenticReviewAutomation: ItemDetailResponse['agenticReviewAutomation'] = null;
        try {
          const aggregatedSignals = loadSubcategoryReviewAutomationSignals(item.Artikel_Nummer ?? '', {
            getItemReference: ctx.getItemReference,
            listRecentReviewHistoryBySubcategory: listRecentAgenticRunReviewHistoryBySubcategory,
            logger: console
          });
          agenticReviewAutomation = {
            sampleSize: aggregatedSignals.sampleSize,
            sampleTarget: aggregatedSignals.sampleTarget,
            lowConfidence: aggregatedSignals.lowConfidence,
            metrics: {
              bad_format_true: {
                count: aggregatedSignals.badFormatTrueCount,
                pct: aggregatedSignals.badFormatTruePct
              },
              wrong_information_true: {
                count: aggregatedSignals.wrongInformationTrueCount,
                pct: aggregatedSignals.wrongInformationTruePct
              },
              wrong_physical_dimensions_true: {
                count: aggregatedSignals.wrongPhysicalDimensionsTrueCount,
                pct: aggregatedSignals.wrongPhysicalDimensionsTruePct
              },
              information_present_false: {
                count: aggregatedSignals.informationPresentFalseCount,
                pct: aggregatedSignals.informationPresentFalsePct
              }
            },
            missingSpecTopKeys: aggregatedSignals.missingSpecTopKeys,
            triggerStates: {
              bad_format_trigger: aggregatedSignals.bad_format_trigger,
              wrong_information_trigger: aggregatedSignals.wrong_information_trigger,
              wrong_physical_dimensions_trigger: aggregatedSignals.wrong_physical_dimensions_trigger,
              missing_spec_trigger: aggregatedSignals.missing_spec_trigger,
              information_present_low_trigger: aggregatedSignals.information_present_low_trigger
            }
          };
        } catch (error) {
          console.error('[save-item] Failed to load review automation metrics for detail payload', {
            itemId,
            artikelNummer: item.Artikel_Nummer ?? null,
            error
          });
          agenticReviewAutomation = null;
        }

        let responsePayload: {
          item: Item;
          reference: ItemRef | null;
          box: unknown;
          events: unknown;
          agentic: AgenticRun | null;
          agenticReviewAutomation: ItemDetailResponse['agenticReviewAutomation'];
          media: string[];
          instances: ItemInstanceSummary[];
        };
        try {
          const responseItem =
            normalisedGrafikname && normalisedGrafikname !== sanitizedItem.Grafikname
              ? { ...itemWithCategories, Grafikname: normalisedGrafikname }
              : itemWithCategories;
          responsePayload = {
            item: responseItem,
            reference,
            box,
            events,
            agentic,
            agenticReviewAutomation,
            media,
            instances
          };
        } catch (error) {
          console.error('[save-item] Failed to construct item detail response payload', {
            itemId,
            error
          });
          return sendJson(res, 500, { error: 'Failed to construct item response' });
        }
        console.info('[save-item] Prepared item detail response', {
          itemId,
          mediaCount: media.length,
          hasReference: Boolean(reference),
          hasAgentic: Boolean(agentic),
          hasReviewAutomation: Boolean(agenticReviewAutomation),
          instanceCount: instances.length
        });
        return sendJson(res, 200, responsePayload);
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
      let grafikWasExplicitlyUpdated = false;
      const incomingGrafiknameNormalization = normalizeGrafiknameForPersistence(data.Grafikname, {
        itemId,
        artikelNummer: mediaArtikelNummer,
        source: 'payload'
      });
      if (incomingGrafiknameNormalization.shouldUpdate) {
        grafik = incomingGrafiknameNormalization.value ?? '';
        grafikWasExplicitlyUpdated = true;
      }
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
            if (removeItemMediaAsset(itemId, mediaArtikelNummer, asset)) {
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
          const dir = resolveUploadMediaPath(mediaFolder);
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
                grafik = file;
                grafikWasExplicitlyUpdated = true;
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
          const fallbackGrafiknameNormalization = normalizeGrafiknameForPersistence(path.posix.basename(fallbackPrimary), {
            itemId,
            artikelNummer: mediaArtikelNummer,
            source: 'fallback-media'
          });
          grafik = fallbackGrafiknameNormalization.value ?? '';
          grafikWasExplicitlyUpdated = true;
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
        'EAN',
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
      const resolvedGrafikname =
        grafikWasExplicitlyUpdated && typeof grafik === 'string'
          ? (grafik.trim() ? grafik.trim() : '')
          : existingReference?.Grafikname;
      referenceUpdates.Grafikname = resolvedGrafikname;
      if (resolvedGrafikname !== normalisedGrafikname && grafikWasExplicitlyUpdated) {
        console.info('[save-item] Persisting filename-only Grafikname while serving normalized media URLs', {
          itemId,
          artikelNummer,
          resolvedGrafikname,
          responseGrafikname: normalisedGrafikname ?? null
        });
      }
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
      const responseBody = { ok: true, media };
      console.info('[save-item] Prepared item update response', {
        itemId,
        artikelNummer,
        mediaCount: media.length
      });
      sendJson(res, 200, responseBody);
    } catch (err) {
      console.error('Save item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Item update API</p></div>'
});

export default action;
