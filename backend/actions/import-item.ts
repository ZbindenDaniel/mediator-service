// TODO(agent): add action tests.
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
// TODO(agent): Capture structured Langtext ingestion telemetry to validate helper fallbacks before removing string pathways.
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  ItemEinheit,
  ItemRef,
  normalizeItemEinheit,
  resolveAgenticRunStatus
} from '../../models';
import type { AgenticRunStatus } from '../../models';
import { defineHttpAction } from './index';
import { resolveStandortLabel, normalizeStandortCode } from '../standort-label';
import { forwardAgenticTrigger } from './agentic-trigger';
import { parseSequentialItemUUID } from '../lib/itemIds';
import { formatArtikelNummerForMedia, MEDIA_DIR, resolveMediaFolder } from '../lib/media';
import { parseLangtext } from '../lib/langtext';
import { IMPORT_DATE_FIELD_PRIORITIES } from '../importer';
import { resolveCategoryLabelToCode } from '../lib/categoryLabelLookup';
import { normalizeQuality, resolveQualityFromLabel } from '../../models/quality';
import { resolveCanonicalItemUUIDForArtikelnummer } from '../db';

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

// TODO(grouping-audit): Evaluate if import should enforce default Quality when null-grouping spikes persist.
// TODO(agent): Consolidate ItemUUID collision handling into a shared allocator helper for reuse across actions.
// TODO(agent): Capture the provisional ItemUUID sequence snapshot to avoid reusing stale maxima during regeneration.
// TODO(agent): Normalize getItem.get to a consistent sync/async contract to simplify uniqueness checks.
// TODO(agent): Confirm legacy Einheit normalization coverage for import-item once CSV-derived payloads are audited.
// TODO(agent): Document ItemUUID parser expectations for Artikelnummer-based formats when adding new import clients.
// TODO(agent): Align legacy quantity normalization rules between import-item and CSV ingestion flows.
async function ensureUniqueItemUUID(
  candidate: string,
  ctx: any,
  options: { reserved?: ReadonlySet<string> } = {}
): Promise<string> {
  const maxAttempts = Math.max(3, (options.reserved?.size ?? 0) + 2);
  let attempt = 0;
  let itemUUID = candidate;
  const reserved = options.reserved;

  const resolveSequentialContext = (
    current: string
  ): { prefix: string; identifier: string; sequence: number; kind: 'artikelnummer' | 'date' } | null => {
    let parsed: ReturnType<typeof parseSequentialItemUUID> | null = null;
    try {
      parsed = parseSequentialItemUUID(current);
    } catch (error) {
      console.error('[import-item] Failed to parse ItemUUID during collision handling', {
        candidate: current,
        error
      });
    }
    if (!parsed) {
      return null;
    }

    const identifier = parsed.kind === 'artikelnummer' ? parsed.artikelNummer : parsed.dateSegment;
    const suffixWidth = identifier.length + 1 + String(parsed.sequence).padStart(4, '0').length;
    const prefixLength = current.length - suffixWidth;
    const prefix = prefixLength > 0 ? current.slice(0, prefixLength) : '';
    return {
      prefix,
      identifier,
      sequence: parsed.sequence,
      kind: parsed.kind
    };
  };

  const resolveNextSequenceFromDb = async (current: string): Promise<string | null> => {
    const context = resolveSequentialContext(current);
    if (!context || !ctx?.db?.prepare) {
      return null;
    }

    const sequenceStartIndex = context.prefix.length + context.identifier.length + 2;
    const pattern = `${context.prefix}${context.identifier}-%`;

    try {
      const statement = ctx.db.prepare(
        `SELECT ItemUUID
         FROM items
         WHERE ItemUUID LIKE ?
         ORDER BY CAST(substr(ItemUUID, ?, 4) AS INTEGER) DESC
         LIMIT 1`
      );
      const row = statement.get(pattern, sequenceStartIndex) as { ItemUUID?: string } | undefined;
      const parsed = row?.ItemUUID ? parseSequentialItemUUID(row.ItemUUID, context.prefix) : null;
      if (row?.ItemUUID && !parsed) {
        console.warn('[import-item] Unable to parse ItemUUID from collision query result', {
          candidate: current,
          ItemUUID: row.ItemUUID
        });
      }
      const latestSequence = parsed ? parsed.sequence : null;
      const nextSequence = Math.max(latestSequence ?? 0, context.sequence) + 1;
      const nextSequenceSegment = String(nextSequence).padStart(4, '0');
      return `${context.prefix}${context.identifier}-${nextSequenceSegment}`;
    } catch (dbSequenceError) {
      console.error('[import-item] Failed to resolve next ItemUUID sequence from database', {
        candidate: current,
        pattern,
        sequenceStartIndex,
        error: dbSequenceError
      });
      return null;
    }
  };

  while (attempt < maxAttempts) {
    let existing: unknown = null;
    const isReserved = Boolean(reserved?.has(itemUUID));
    if (isReserved) {
      console.warn('[import-item] Candidate ItemUUID already reserved for this import batch', {
        attempt,
        itemUUID
      });
    } else {
      try {
        const existingLookup = ctx.getItem?.get ? ctx.getItem.get(itemUUID) : null;
        existing = typeof (existingLookup as Promise<unknown>)?.then === 'function'
          ? await existingLookup
          : existingLookup;
      } catch (lookupError) {
        console.error('[import-item] Failed to verify ItemUUID uniqueness during mint', {
          attempt,
          itemUUID,
          error: lookupError
        });
      }
    }

    if (!existing && !isReserved) {
      return itemUUID;
    }

    attempt += 1;
    console.warn('[import-item] Detected ItemUUID collision while minting; retrying with fresh identifier', {
      attempt,
      itemUUID,
      collisionType: isReserved ? 'reserved' : 'existing'
    });

    try {
      const dbSequenceCandidate = await resolveNextSequenceFromDb(itemUUID);
      if (dbSequenceCandidate) {
        console.info('[import-item] Resolved next ItemUUID sequence from database after collision', {
          attempt,
          previousItemUUID: itemUUID,
          nextItemUUID: dbSequenceCandidate
        });
        itemUUID = dbSequenceCandidate;
        continue;
      }

      const regeneratingContext = resolveSequentialContext(itemUUID);
      if (regeneratingContext?.kind === 'artikelnummer') {
        const regenerated = await ctx.generateItemUUID(regeneratingContext.identifier);
        if (regenerated && regenerated !== itemUUID) {
          itemUUID = regenerated;
          continue;
        }
      }

      if (regeneratingContext) {
        const nextSequence = regeneratingContext.sequence + 1;
        const nextSequenceSegment = String(nextSequence).padStart(4, '0');
        const sequentialCandidate = `${regeneratingContext.prefix}${regeneratingContext.identifier}-${nextSequenceSegment}`;
        console.info('[import-item] Incrementing ItemUUID sequence locally to avoid repeated collisions', {
          attempt,
          previousItemUUID: itemUUID,
          nextItemUUID: sequentialCandidate
        });
        itemUUID = sequentialCandidate;
        continue;
      }
    } catch (regenError) {
      console.error('[import-item] Failed to remint ItemUUID after collision', {
        attempt,
        previousItemUUID: itemUUID,
        error: regenError
      });
      break;
    }

    console.error('[import-item] Unable to generate a new ItemUUID distinct from existing collision candidate', {
      attempt,
      lastItemUUID: itemUUID
    });
    break;
  }

  throw new Error('Failed to mint a unique ItemUUID for import');
}

function coalesceEinheit(value: string | null): ItemEinheit {
  const raw = value ?? '';
  const trimmed = raw.trim();
  try {
    const normalized = normalizeItemEinheit(trimmed);
    if (normalized) {
      return normalized;
    }
  } catch (error) {
    console.error('[import-item] Failed to evaluate Einheit payload, defaulting to Stk', {
      provided: value,
      error
    });
    return DEFAULT_EINHEIT;
  }
  console.warn('[import-item] Falling back to default Einheit value', {
    provided: value,
    trimmed,
    defaultValue: DEFAULT_EINHEIT
  });
  return DEFAULT_EINHEIT;
}

function resolveRequestedQuantity(
  rawValue: string | null,
  context: { ItemUUID: string; artikelNummer: string | null }
): number {
  // TODO(agent): Enrich quantity normalization telemetry with request-scoped metadata once import tracing lands.
  let quantity = 1;
  try {
    if (rawValue === null) {
      console.warn('[import-item] Auf_Lager missing from payload; defaulting to 1', {
        ...context
      });
    }
    if (rawValue) {
      const parsed = Number.parseInt(rawValue.trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        quantity = parsed;
      } else {
        console.warn('[import-item] Invalid Auf_Lager value provided; defaulting to 1', {
          ...context,
          provided: rawValue
        });
      }
    }
  } catch (error) {
    console.error('[import-item] Failed to normalize Auf_Lager value; defaulting to 1', {
      ...context,
      error
    });
    quantity = 1;
  }
  return quantity;
}

function normalizeSearchTermInput(
  value: string | null,
  context: { itemUUID: string; artikelNummer: string | null; source: string }
): string {
  try {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return '';
    }
    return trimmed;
  } catch (error) {
    console.error('[import-item] Failed to normalize Suchbegriff input', {
      itemUUID: context.itemUUID,
      artikelNummer: context.artikelNummer,
      source: context.source,
      error
    });
    return '';
  }
}

type ItemCreationMode = 'bulk' | 'instance';

// TODO(agent): Align add/remove item quantity adjustments with instance-based creation for Einheit Stk.
// TODO(agent): Verify non-bulk instance count handling for update requests during import-item adjustments.
function resolveItemCreationPlan(options: {
  requestedQuantity: number;
  einheit: ItemEinheit;
  isUpdateRequest: boolean;
}): { mode: ItemCreationMode; instanceCount: number; quantityPerItem: number } {
  const normalizedQuantity = Math.max(options.requestedQuantity, 1);
  if (options.isUpdateRequest) {
    if (options.einheit === ItemEinheit.Menge) {
      return { mode: 'bulk', instanceCount: 1, quantityPerItem: normalizedQuantity };
    }
    return { mode: 'instance', instanceCount: 1, quantityPerItem: 1 };
  }

  if (options.einheit === ItemEinheit.Menge) {
    return { mode: 'bulk', instanceCount: 1, quantityPerItem: normalizedQuantity };
  }
  return { mode: 'instance', instanceCount: normalizedQuantity, quantityPerItem: 1 };
}

function normalizeItemReferenceRow(row: unknown): ItemRef | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const record = row as Record<string, unknown>;
  const artikelValue = record.Artikel_Nummer;
  const artikelNummer = typeof artikelValue === 'string' ? artikelValue.trim() : '';

  if (!artikelNummer) {
    return null;
  }

  const normalized: ItemRef = { Artikel_Nummer: artikelNummer };

  if (typeof record.Suchbegriff === 'string') normalized.Suchbegriff = record.Suchbegriff;
  if (typeof record.Grafikname === 'string') normalized.Grafikname = record.Grafikname;
  if (typeof record.Artikelbeschreibung === 'string') normalized.Artikelbeschreibung = record.Artikelbeschreibung;
  if (typeof record.Verkaufspreis === 'number' && Number.isFinite(record.Verkaufspreis)) {
    normalized.Verkaufspreis = record.Verkaufspreis;
  }
  if (typeof record.Kurzbeschreibung === 'string') normalized.Kurzbeschreibung = record.Kurzbeschreibung;
  if (Object.prototype.hasOwnProperty.call(record, 'Langtext')) {
    const parsedLangtext = parseLangtext(record.Langtext, {
      logger: console,
      context: 'import-item:normalize-reference',
      artikelNummer
    });
    if (parsedLangtext !== null) {
      let cleanedLangtext: ItemRef['Langtext'] = parsedLangtext;
      if (parsedLangtext && typeof parsedLangtext === 'object' && !Array.isArray(parsedLangtext)) {
        const langtextPayload = { ...(parsedLangtext as Record<string, string>) };
        const qualityLabel = langtextPayload.Qualität ?? langtextPayload.Qualitaet;
        if (qualityLabel !== undefined) {
          try {
            const resolvedQuality = resolveQualityFromLabel(qualityLabel, console);
            if (resolvedQuality !== null) {
              normalized.Quality = normalizeQuality(resolvedQuality, console);
            } else {
              console.warn('[import-item] Unable to resolve Qualität label in reference Langtext payload', {
                artikelNummer,
                qualityLabel
              });
            }
          } catch (qualityError) {
            console.error('[import-item] Failed to resolve Qualität label in reference Langtext payload', {
              artikelNummer,
              qualityLabel,
              error: qualityError
            });
          }
          delete langtextPayload.Qualität;
          delete langtextPayload.Qualitaet;
        }
        cleanedLangtext = langtextPayload;
      }
      normalized.Langtext = cleanedLangtext;
    }
  }
  if (typeof record.Hersteller === 'string') normalized.Hersteller = record.Hersteller;
  if (typeof record.Länge_mm === 'number' && Number.isFinite(record.Länge_mm)) normalized.Länge_mm = record.Länge_mm;
  if (typeof record.Breite_mm === 'number' && Number.isFinite(record.Breite_mm)) normalized.Breite_mm = record.Breite_mm;
  if (typeof record.Höhe_mm === 'number' && Number.isFinite(record.Höhe_mm)) normalized.Höhe_mm = record.Höhe_mm;
  if (typeof record.Gewicht_kg === 'number' && Number.isFinite(record.Gewicht_kg)) normalized.Gewicht_kg = record.Gewicht_kg;
  if (typeof record.Hauptkategorien_A === 'number' && Number.isFinite(record.Hauptkategorien_A)) {
    normalized.Hauptkategorien_A = record.Hauptkategorien_A;
  }
  if (typeof record.Unterkategorien_A === 'number' && Number.isFinite(record.Unterkategorien_A)) {
    normalized.Unterkategorien_A = record.Unterkategorien_A;
  }
  if (typeof record.Hauptkategorien_B === 'number' && Number.isFinite(record.Hauptkategorien_B)) {
    normalized.Hauptkategorien_B = record.Hauptkategorien_B;
  }
  if (typeof record.Unterkategorien_B === 'number' && Number.isFinite(record.Unterkategorien_B)) {
    normalized.Unterkategorien_B = record.Unterkategorien_B;
  }
  if (typeof record.Veröffentlicht_Status === 'string') {
    normalized.Veröffentlicht_Status = record.Veröffentlicht_Status;
  }
  if (typeof record.Shopartikel === 'number' && Number.isFinite(record.Shopartikel)) {
    normalized.Shopartikel = record.Shopartikel;
  }
  if (typeof record.Artikeltyp === 'string') normalized.Artikeltyp = record.Artikeltyp;
  if (typeof record.Einheit === 'string') {
    const normalizedEinheit = normalizeItemEinheit(record.Einheit);
    if (normalizedEinheit) {
      normalized.Einheit = normalizedEinheit;
    }
  }
  if (typeof record.EntityType === 'string') normalized.EntityType = record.EntityType;

  return normalized;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function resolveRequestPath(req: IncomingMessage): string {
  const raw = req.url ?? '';
  if (!raw) {
    return '';
  }

  try {
    const candidate = new URL(raw, 'http://localhost');
    return candidate.pathname;
  } catch (error) {
    console.error('[import-item] Failed to parse request URL; falling back to raw path fragment', {
      rawUrl: raw,
      error
    });
    const trimmed = raw.split('?')[0];
    return trimmed;
  }
}

function extractItemUUIDFromPath(pathname: string): string | null {
  if (!pathname) {
    return null;
  }

  const match = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    console.error('[import-item] Failed to decode ItemUUID from request path', {
      pathname,
      segment: match[1],
      error
    });
    return match[1];
  }
}

const action = defineHttpAction({
  key: 'import-item',
  label: 'Import item',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import/item' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const p = new URLSearchParams(raw);
      const actor = (p.get('actor') || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const nowDate = new Date();
      const providedBoxId = (p.get('BoxID') || '').trim();
      const BoxID = providedBoxId ? providedBoxId : null;
      if (!BoxID) {
        console.info('[import-item] Persisting item without box placement', { actor });
      }
      const incomingItemUUID = (p.get('ItemUUID') || '').trim();
      const incomingArtikelNummer = (p.get('Artikel_Nummer') || '').trim();
      const requestPath = resolveRequestPath(req);
      const pathItemUUID = extractItemUUIDFromPath(requestPath);
      const isUpdateRequest = Boolean(pathItemUUID);

      type BranchResolution = {
        itemUUID: string;
        artikelNummer: string | null;
        skipReferencePersistence: boolean;
        referenceOverride: ItemRef | null;
      };

      let branch: BranchResolution | null = null;

      const prepareNewItemCreationBranch = async (
        artikelNummerCandidate: string | null
      ): Promise<BranchResolution> => {
        if (!ctx || typeof ctx.generateItemUUID !== 'function') {
          throw new Error('Missing generateItemUUID dependency for new item creation');
        }

        let mintedUUID: string;
        try {
          mintedUUID = await ctx.generateItemUUID(artikelNummerCandidate);
        } catch (error) {
          console.error('[import-item] Failed to mint ItemUUID for new item import', {
            Artikel_Nummer: artikelNummerCandidate || undefined,
            requestPath,
            error
          });
          throw new Error('Failed to mint ItemUUID for new item import');
        }

        console.info('[import-item] Generated new ItemUUID for item import', {
          ItemUUID: mintedUUID,
          Artikel_Nummer: artikelNummerCandidate || undefined,
          requestPath
        });

        return {
          itemUUID: mintedUUID,
          artikelNummer: artikelNummerCandidate,
          skipReferencePersistence: false,
          referenceOverride: null
        };
      };

      if (isUpdateRequest && pathItemUUID) {
        try {
          branch = {
            itemUUID: pathItemUUID,
            artikelNummer: incomingArtikelNummer || null,
            skipReferencePersistence: false,
            referenceOverride: null
          };

          if (incomingItemUUID && incomingItemUUID !== pathItemUUID) {
            console.warn('[import-item] Ignoring mismatched ItemUUID in payload for update request', {
              requestPath,
              incomingItemUUID,
              pathItemUUID
            });
          } else {
            console.info('[import-item] Processing item update based on request path', { ItemUUID: pathItemUUID });
          }
        } catch (branchErr) {
          console.error('[import-item] Failed to resolve update branch context', {
            pathItemUUID,
            error: branchErr
          });
          return sendJson(res, 500, { error: 'Failed to resolve update request context' });
        }
      } else if (incomingItemUUID && !incomingArtikelNummer) {
        console.warn('[import-item] Rejecting new item import due to missing Artikel_Nummer for provided ItemUUID', {
          incomingItemUUID,
          requestPath
        });
        return sendJson(res, 400, {
          error: 'Artikel_Nummer is required when providing ItemUUID for new item imports'
        });
      } else if (incomingArtikelNummer && !incomingItemUUID) {
        try {
          if (!ctx?.getItemReference?.get) {
            throw new Error('Missing getItemReference dependency for reference lookup');
          }

          let referenceRow: unknown;
          try {
            referenceRow = ctx.getItemReference.get(incomingArtikelNummer);
          } catch (lookupErr) {
            console.error('[import-item] Failed to fetch item reference for creation-by-reference branch', {
              artikelNummer: incomingArtikelNummer,
              error: lookupErr
            });
            throw new Error('Failed to load item reference for provided Artikel_Nummer');
          }

          const normalizedReference = normalizeItemReferenceRow(referenceRow);
          if (!normalizedReference) {
            console.warn('[import-item] No item reference found for creation-by-reference request', {
              artikelNummer: incomingArtikelNummer
            });
            console.info('[import-item] Falling back to direct item creation due to missing reference lookup', {
              Artikel_Nummer: incomingArtikelNummer,
              requestPath
            });
            branch = await prepareNewItemCreationBranch(incomingArtikelNummer || null);
          } else {
            if (!ctx || typeof ctx.generateItemUUID !== 'function') {
              throw new Error('Missing generateItemUUID dependency for creation-by-reference branch');
            }

            let mintedUUID: string;
            try {
              mintedUUID = await ctx.generateItemUUID(normalizedReference.Artikel_Nummer);
            } catch (error) {
              console.error('[import-item] Failed to mint ItemUUID for creation-by-reference branch', {
                Artikel_Nummer: normalizedReference.Artikel_Nummer,
                requestPath,
                error
              });
              throw new Error('Failed to mint ItemUUID for creation-by-reference branch');
            }
            console.info('[import-item] Creating new item instance from existing reference', {
              ItemUUID: mintedUUID,
              Artikel_Nummer: normalizedReference.Artikel_Nummer,
              requestPath
            });

            branch = {
              itemUUID: mintedUUID,
              artikelNummer: normalizedReference.Artikel_Nummer,
              skipReferencePersistence: true,
              referenceOverride: normalizedReference
            };
          }
        } catch (branchErr) {
          if (!res.writableEnded) {
            console.error('[import-item] Failed to resolve creation-by-reference branch', {
              artikelNummer: incomingArtikelNummer,
              error: branchErr
            });
            return sendJson(res, 500, { error: (branchErr as Error).message });
          }
          return;
        }
      } else {
        try {
          if (incomingItemUUID) {
            console.info('[import-item] Discarding ItemUUID provided for new item import', {
              incomingItemUUID,
              requestPath
            });
          }
          branch = await prepareNewItemCreationBranch(incomingArtikelNummer ? incomingArtikelNummer : null);
        } catch (branchErr) {
          console.error('[import-item] Failed to prepare new item creation branch', branchErr);
          return sendJson(res, 500, { error: (branchErr as Error).message });
        }
      }

      if (!branch) {
        console.error('[import-item] Unable to resolve persistence branch for item import', {
          requestPath,
          incomingItemUUID,
          incomingArtikelNummer
        });
        return sendJson(res, 500, { error: 'Failed to resolve item import strategy' });
      }

      let ItemUUID = branch.itemUUID;
      try {
        ItemUUID = await ensureUniqueItemUUID(branch.itemUUID, ctx);
      } catch (collisionError) {
        console.error('[import-item] Aborting import due to repeated ItemUUID collisions', {
          requestedItemUUID: branch.itemUUID,
          error: collisionError
        });
        return sendJson(res, 500, { error: 'Failed to mint unique ItemUUID for item import' });
      }
      const resolvedArtikelNummer = branch.artikelNummer ?? '';
      const referenceDefaults = branch.referenceOverride;
      const isCreationByReference = Boolean(branch.skipReferencePersistence);
      const persistenceMetadata: Record<string, unknown> = {};
      if (branch.skipReferencePersistence) {
        persistenceMetadata.__skipReferencePersistence = true;
        if (referenceDefaults) {
          persistenceMetadata.__referenceRowOverride = referenceDefaults;
        }
      }
      const now = nowDate.toISOString();
      const images = [p.get('picture1') || '', p.get('picture2') || '', p.get('picture3') || ''];
      let firstImage = '';
      try {
        const formattedArtikelNummer = formatArtikelNummerForMedia(resolvedArtikelNummer, console);
        const mediaFolder = resolveMediaFolder(ItemUUID, formattedArtikelNummer, console);
        const dir = path.join(MEDIA_DIR, mediaFolder);
        fs.mkdirSync(dir, { recursive: true });
        const artNr = formattedArtikelNummer || mediaFolder;
        images.forEach((img, idx) => {
          if (!img) return;
          const m = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${artNr}-${idx + 1}.${ext}`;
          fs.writeFileSync(path.join(dir, file), buf);
          if (!firstImage) firstImage = `/media/${mediaFolder}/${file}`;
        });
      } catch (e) {
        console.error('Failed to save images', e);
      }
      const requestedLocationRaw = BoxID ? (p.get('Location') || '').trim() : '';
      if (!BoxID && requestedLocationRaw) {
        console.warn('[import-item] Ignoring Location for unplaced item import', {
          actor,
          location: requestedLocationRaw
        });
      }
      const normalizedLocation = BoxID ? normalizeStandortCode(requestedLocationRaw) : null;
      const requestedStandortLabel = BoxID && normalizedLocation ? resolveStandortLabel(normalizedLocation) : null;
      if (normalizedLocation && !requestedStandortLabel) {
        console.warn('[import-item] Missing Standort label mapping for requested location', { location: normalizedLocation });
      }
      const artikelbeschreibungInput = (p.get('Artikelbeschreibung') || '').trim();
      const kurzbeschreibungInput = (p.get('Kurzbeschreibung') || '').trim();
      const langtextInput = (p.get('Langtext') || '').trim();
      let qualityParam: string | null = null;
      let hasQualityParam = false;
      // TODO(import-item): Ensure creation-by-reference payloads always include explicit quantity/quality fields.
      try {
        const rawQualityParam = p.get('Quality');
        hasQualityParam = p.has('Quality');
        qualityParam = typeof rawQualityParam === 'string' ? rawQualityParam.trim() : null;
        if (!hasQualityParam && isCreationByReference) {
          console.warn('[import-item] Missing Quality value in creation-by-reference payload', {
            ItemUUID,
            Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null
          });
        }
        if (hasQualityParam && !qualityParam) {
          console.info('[import-item] Empty Quality value provided in payload; clearing quality', {
            ItemUUID,
            Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null
          });
        }
      } catch (qualityReadError) {
        console.error('[import-item] Failed to read Quality from request payload', {
          ItemUUID,
          Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
          error: qualityReadError
        });
      }
      const herstellerInput = (p.get('Hersteller') || '').trim();
      const verkaufspreisRaw = (p.get('Verkaufspreis') || '').replace(',', '.').trim();
      const gewichtRaw = (p.get('Gewicht_kg') || '').replace(',', '.').trim();
      const laengeRaw = (p.get('Länge_mm') || '').trim();
      const breiteRaw = (p.get('Breite_mm') || '').trim();
      const hoeheRaw = (p.get('Höhe_mm') || '').trim();
      const hauptkategorieARaw = (p.get('Hauptkategorien_A') || '').trim();
      const unterkategorieARaw = (p.get('Unterkategorien_A') || '').trim();
      const hauptkategorieBRaw = (p.get('Hauptkategorien_B') || '').trim();
      const unterkategorieBRaw = (p.get('Unterkategorien_B') || '').trim();
      const shopartikelRaw = (p.get('Shopartikel') || '').trim();
      const artikeltypInput = (p.get('Artikeltyp') || '').trim();
      const publishedRaw = (p.get('Veröffentlicht_Status') || '').trim();
      let datumErfasstRaw = (p.get('Datum_erfasst') || '').trim();
      // TODO(agent): Remove Datum_erfasst alias hydration when all manual imports send normalized timestamps.
      if (!datumErfasstRaw) {
        try {
          for (const aliasField of IMPORT_DATE_FIELD_PRIORITIES) {
            if (aliasField === 'Datum_erfasst') {
              continue;
            }
            const aliasValue = p.get(aliasField);
            if (typeof aliasValue !== 'string') {
              continue;
            }
            const trimmedAlias = aliasValue.trim();
            if (!trimmedAlias) {
              continue;
            }
            datumErfasstRaw = trimmedAlias;
            console.log('[import-item] Defaulted Datum_erfasst from alias column', {
              ItemUUID,
              aliasField
            });
            break;
          }
        } catch (datumErfasstAliasError) {
          console.error('[import-item] Failed to hydrate Datum_erfasst from alias', {
            ItemUUID,
            error: datumErfasstAliasError
          });
        }
      }

      const artikelbeschreibung = artikelbeschreibungInput || referenceDefaults?.Artikelbeschreibung || '';
      const kurzbeschreibung = kurzbeschreibungInput || referenceDefaults?.Kurzbeschreibung || '';
      // TODO(agentic-search-term): Revisit Suchbegriff fallback priority once dedicated UI persists it.
      const suchbegriffCandidate = (() => {
        const explicit = p.get('Suchbegriff');
        if (typeof explicit === 'string' && explicit.trim()) {
          return explicit;
        }
        const agenticSearch = p.get('agenticSearch');
        if (typeof agenticSearch === 'string' && agenticSearch.trim()) {
          return agenticSearch;
        }
        if (typeof referenceDefaults?.Suchbegriff === 'string' && referenceDefaults.Suchbegriff.trim()) {
          return referenceDefaults.Suchbegriff;
        }
        return artikelbeschreibung;
      })();
      const suchbegriff = normalizeSearchTermInput(suchbegriffCandidate, {
        itemUUID: ItemUUID,
        artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null,
        source: 'import-item'
      });
      const parsedLangtextInput = parseLangtext(langtextInput || null, {
        logger: console,
        context: 'import-item:form-langtext',
        artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null,
        itemUUID: ItemUUID
      });
      if (parsedLangtextInput === null && langtextInput) {
        console.warn('[import-item] Langtext input rejected; using fallback values', {
          Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
          ItemUUID,
          provided: langtextInput
        });
      }
      let fallbackLangtext: ItemRef['Langtext'] = '';
      if (referenceDefaults && Object.prototype.hasOwnProperty.call(referenceDefaults, 'Langtext')) {
        fallbackLangtext = referenceDefaults.Langtext ?? '';
      }
      let langtext = (parsedLangtextInput ?? fallbackLangtext) as ItemRef['Langtext'];
      // TODO(quality-create): Keep langtext-derived quality parsing scoped to update flows only.
      let qualityFromLangtext: number | null | undefined;
      if (langtext && typeof langtext === 'object' && !Array.isArray(langtext)) {
        const langtextPayload = { ...(langtext as Record<string, string>) };
        const qualityLabel = langtextPayload.Qualität ?? langtextPayload.Qualitaet;
        if (qualityLabel !== undefined) {
          try {
            const resolvedQuality = resolveQualityFromLabel(qualityLabel, console);
            if (resolvedQuality !== null) {
              qualityFromLangtext = normalizeQuality(resolvedQuality, console);
            } else {
              console.warn('[import-item] Unable to resolve Qualität label from form Langtext payload', {
                Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
                ItemUUID,
                qualityLabel
              });
            }
          } catch (qualityError) {
            console.error('[import-item] Failed to resolve Qualität label from form Langtext payload', {
              Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
              ItemUUID,
              qualityLabel,
              error: qualityError
            });
          }
          delete langtextPayload.Qualität;
          delete langtextPayload.Qualitaet;
        }
        langtext = langtextPayload;
      }
      let qualityFromPayload: number | null | undefined;
      if (hasQualityParam) {
        if (qualityParam) {
          try {
            qualityFromPayload = normalizeQuality(qualityParam, console);
          } catch (qualityError) {
            console.error('[import-item] Failed to normalize Quality from request payload', {
              ItemUUID,
              Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
              provided: qualityParam,
              error: qualityError
            });
          }
        } else {
          qualityFromPayload = null;
        }
      }
      // TODO(quality-create): Remove reference-derived quality fallback once all creation payloads send Quality explicitly.
      let qualityFromReference: number | null | undefined;
      if (referenceDefaults && Object.prototype.hasOwnProperty.call(referenceDefaults, 'Quality')) {
        try {
          qualityFromReference = normalizeQuality(referenceDefaults.Quality, console);
        } catch (qualityError) {
          console.error('[import-item] Failed to normalize Quality from reference defaults', {
            ItemUUID,
            Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
            provided: referenceDefaults.Quality,
            error: qualityError
          });
        }
      }
      const shouldIgnoreDerivedQuality = !isUpdateRequest && !hasQualityParam;
      if (shouldIgnoreDerivedQuality && (qualityFromReference !== undefined || qualityFromLangtext !== undefined)) {
        console.info('[import-item] Ignoring derived Quality for new item creation without explicit Quality', {
          ItemUUID,
          Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
          qualityFromReference,
          qualityFromLangtext
        });
      }
      const hersteller = herstellerInput || referenceDefaults?.Hersteller || '';

      let verkaufspreis = referenceDefaults?.Verkaufspreis ?? 0;
      if (verkaufspreisRaw) {
        const parsedVerkaufspreis = parseFloat(verkaufspreisRaw);
        if (Number.isFinite(parsedVerkaufspreis)) {
          verkaufspreis = parsedVerkaufspreis;
        } else if (referenceDefaults?.Verkaufspreis === undefined) {
          verkaufspreis = 0;
        }
      }

      let gewichtKg: number | null = referenceDefaults?.Gewicht_kg ?? null;
      if (gewichtRaw) {
        const parsedGewicht = parseFloat(gewichtRaw);
        if (Number.isFinite(parsedGewicht)) {
          gewichtKg = parsedGewicht;
        } else if (referenceDefaults?.Gewicht_kg === undefined) {
          gewichtKg = null;
        }
      }

      type IntegerResolverOptions = {
        fieldName: string;
        categoryType?: 'haupt' | 'unter';
      };

      const resolveInteger = (
        raw: string,
        fallback: number | null | undefined,
        options?: IntegerResolverOptions
      ): number | null | undefined => {
        if (!raw) {
          return fallback ?? null;
        }

        const trimmed = raw.trim();
        if (!trimmed) {
          return fallback ?? null;
        }

        if (options?.categoryType) {
          try {
            const mapped = resolveCategoryLabelToCode(trimmed, options.categoryType);
            if (typeof mapped === 'number') {
              return mapped;
            }
          } catch (error) {
            console.error('[import-item] Failed to resolve category label to code', {
              field: options.fieldName,
              value: raw,
              error
            });
          }
        }

        const parsed = parseInt(trimmed, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }

        if (options?.categoryType) {
          console.warn('[import-item] Unable to map category label to numeric code', {
            field: options.fieldName,
            value: raw
          });
        }

        // TODO(agent): Teach resolveInteger about localized number formats when non-category payloads require it.
        return fallback ?? null;
      };

      const laenge = resolveInteger(laengeRaw, referenceDefaults?.Länge_mm ?? null);
      const breite = resolveInteger(breiteRaw, referenceDefaults?.Breite_mm ?? null);
      const hoehe = resolveInteger(hoeheRaw, referenceDefaults?.Höhe_mm ?? null);
      const hauptkategorienA = resolveInteger(hauptkategorieARaw, referenceDefaults?.Hauptkategorien_A, {
        fieldName: 'Hauptkategorien_A',
        categoryType: 'haupt'
      });
      const unterkategorienA = resolveInteger(unterkategorieARaw, referenceDefaults?.Unterkategorien_A, {
        fieldName: 'Unterkategorien_A',
        categoryType: 'unter'
      });
      const hauptkategorienB = resolveInteger(hauptkategorieBRaw, referenceDefaults?.Hauptkategorien_B, {
        fieldName: 'Hauptkategorien_B',
        categoryType: 'haupt'
      });
      const unterkategorienB = resolveInteger(unterkategorieBRaw, referenceDefaults?.Unterkategorien_B, {
        fieldName: 'Unterkategorien_B',
        categoryType: 'unter'
      });

      let shopartikel = referenceDefaults?.Shopartikel ?? 0;
      if (shopartikelRaw) {
        const parsedShopartikel = parseInt(shopartikelRaw, 10);
        if (Number.isFinite(parsedShopartikel)) {
          shopartikel = parsedShopartikel;
        } else if (referenceDefaults?.Shopartikel === undefined) {
          shopartikel = 0;
        }
      }

      const artikeltyp = artikeltypInput || referenceDefaults?.Artikeltyp || '';
      const veröffentlichtStatus = publishedRaw
        ? ['yes', 'ja', 'true', '1'].includes(publishedRaw.toLowerCase())
        : referenceDefaults?.Veröffentlicht_Status ?? false;

      const einheitParam = p.get('Einheit');
      const einheit = einheitParam ? coalesceEinheit(einheitParam) : referenceDefaults?.Einheit ?? DEFAULT_EINHEIT;

      // TODO(timestamp-normalization): Audit creation defaults once dedicated created/updated columns exist.
      let datumErfasst: Date | undefined;
      if (datumErfasstRaw) {
        try {
          const parsedDatum = new Date(datumErfasstRaw);
          if (Number.isNaN(parsedDatum.getTime())) {
            console.warn('[import-item] Invalid Datum_erfasst provided; defaulting to creation timestamp', {
              ItemUUID,
              datumErfasstRaw
            });
            datumErfasst = new Date(nowDate.getTime());
          } else {
            datumErfasst = parsedDatum;
          }
        } catch (parseErr) {
          console.error('[import-item] Failed to parse Datum_erfasst; falling back to creation timestamp', {
            ItemUUID,
            datumErfasstRaw,
            error: parseErr
          });
          datumErfasst = new Date(nowDate.getTime());
        }
      } else {
        datumErfasst = new Date(nowDate.getTime());
      }

      let requestedQuantityRaw: string | null = null;
      try {
        requestedQuantityRaw = p.get('Auf_Lager');
        if (!requestedQuantityRaw && isCreationByReference) {
          console.warn('[import-item] Missing Auf_Lager value in creation-by-reference payload', {
            ItemUUID,
            Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null
          });
        }
        if (!requestedQuantityRaw && isUpdateRequest) {
          console.warn('[import-item] Missing Auf_Lager value in update request payload; defaulting to 1', {
            ItemUUID,
            Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null
          });
        }
      } catch (quantityReadError) {
        console.error('[import-item] Failed to read Auf_Lager from request payload', {
          ItemUUID,
          Artikel_Nummer: resolvedArtikelNummer || incomingArtikelNummer || null,
          error: quantityReadError
        });
      }

      const requestedQuantity = resolveRequestedQuantity(requestedQuantityRaw, {
        ItemUUID,
        artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null
      });
      const creationPlan = resolveItemCreationPlan({
        requestedQuantity,
        einheit,
        isUpdateRequest
      });
      if (isUpdateRequest && creationPlan.mode === 'instance' && requestedQuantity > 1) {
        console.warn('[import-item] Update request requested multiple instances; defaulting to a single instance', {
          ItemUUID,
          requestedQuantity,
          einheit
        });
      }
      console.info('[import-item] Resolved item creation mode for import', {
        ItemUUID,
        mode: creationPlan.mode,
        requestedQuantity,
        instanceCount: creationPlan.instanceCount,
        quantityPerItem: creationPlan.quantityPerItem,
        einheit,
        isUpdateRequest
      });

      const data = {
        BoxID,
        Location: normalizedLocation,
        UpdatedAt: nowDate,
        Datum_erfasst: datumErfasst,
        Artikel_Nummer: resolvedArtikelNummer,
        Grafikname: firstImage || referenceDefaults?.Grafikname || '',
        Suchbegriff: suchbegriff || undefined,
        Artikelbeschreibung: artikelbeschreibung,
        Auf_Lager: creationPlan.quantityPerItem,
        Verkaufspreis: verkaufspreis,
        Kurzbeschreibung: kurzbeschreibung,
        Langtext: langtext,
        Quality: isUpdateRequest
          ? hasQualityParam
            ? (qualityFromPayload ?? null)
            : (qualityFromLangtext ?? qualityFromReference ?? null)
          : hasQualityParam
            ? (qualityFromPayload ?? null)
            : null,
        Hersteller: hersteller,
        Länge_mm: laenge,
        Breite_mm: breite,
        Höhe_mm: hoehe,
        Gewicht_kg: gewichtKg,
        Hauptkategorien_A: hauptkategorienA === null ? undefined : hauptkategorienA ?? undefined,
        Unterkategorien_A: unterkategorienA === null ? undefined : unterkategorienA ?? undefined,
        Hauptkategorien_B: hauptkategorienB === null ? undefined : hauptkategorienB ?? undefined,
        Unterkategorien_B: unterkategorienB === null ? undefined : unterkategorienB ?? undefined,
        Veröffentlicht_Status: veröffentlichtStatus,
        Shopartikel: shopartikel,
        Artikeltyp: artikeltyp,
        Einheit: einheit,
        ...persistenceMetadata
      };

      // TODO(agentic-triggering): Confirm agentic seed rules for multi-instance creation once UX clarifies intent.
      const agenticSearchQuery = normalizeSearchTermInput(
        (p.get('agenticSearch') || suchbegriff || data.Artikelbeschreibung || '') as string,
        {
          itemUUID: ItemUUID,
          artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null,
          source: 'agenticSearch'
        }
      );
      const requestedStatus = (p.get('agenticStatus') || '').trim();
      const manualFallbackFlag = (p.get('agenticManualFallback') || '').trim().toLowerCase();
      const agenticManualFallback = manualFallbackFlag === 'true';
      const resolvedAgenticStatus: AgenticRunStatus = resolveAgenticRunStatus(requestedStatus);
      const agenticStatus: AgenticRunStatus = agenticManualFallback
        ? AGENTIC_RUN_STATUS_NOT_STARTED
        : resolvedAgenticStatus;
      const agenticRunManuallySkipped = agenticManualFallback || agenticStatus === AGENTIC_RUN_STATUS_NOT_STARTED;

      // TODO(agentic-ingestion-audit): Capture structured metrics for agentic run registration during imports to validate start coverage.

      let boxLocationIdToPersist: string | null = normalizedLocation || null;
      let boxLabelToPersist: string | null = requestedStandortLabel;
      // TODO(agent): Confirm PhotoPath preservation remains aligned with the boxes schema during imports.
      let preservedBoxPhotoPath: string | null = null;
      if (BoxID) {
        if (!normalizedLocation) {
          console.warn(
            '[import-item] Empty Location provided for box import; attempting to preserve existing Standort',
            { BoxID, actor }
          );
          try {
            const existingBox = ctx.getBox?.get
              ? (ctx.getBox.get(BoxID) as {
                  LocationId?: string | null;
                  Label?: string | null;
                  PhotoPath?: string | null;
                } | undefined)
              : undefined;
            if (existingBox?.LocationId) {
              boxLocationIdToPersist = existingBox.LocationId;
              boxLabelToPersist = existingBox.Label ?? resolveStandortLabel(existingBox.LocationId);
              preservedBoxPhotoPath = existingBox.PhotoPath ?? null;
              console.info('[import-item] Preserved existing box LocationId', { BoxID, LocationId: existingBox.LocationId });
            } else {
              boxLocationIdToPersist = null;
              boxLabelToPersist = null;
              console.info('[import-item] No existing Location found to preserve for box', { BoxID });
            }
          } catch (lookupErr) {
            console.error('[import-item] Failed to load box while preserving Location', lookupErr);
          }
        }
      } else {
        boxLocationIdToPersist = null;
        boxLabelToPersist = null;
      }

      // TODO(import-item): Revisit batch ItemUUID reservation strategy once generator supports bulk allocation.
      let itemUUIDs: string[] = [];
      let hadExistingInstanceForArtikel = false;
      if (resolvedArtikelNummer && ctx.findByMaterial?.all) {
        try {
          const existingInstances = ctx.findByMaterial.all(resolvedArtikelNummer) as Array<{ ItemUUID?: string }> | undefined;
          hadExistingInstanceForArtikel = Array.isArray(existingInstances)
            && existingInstances.some((instance) => typeof instance?.ItemUUID === 'string' && instance.ItemUUID.trim());
        } catch (lookupErr) {
          console.error('[import-item] Failed to check existing instances before agentic trigger decision', {
            artikelNummer: resolvedArtikelNummer,
            error: lookupErr
          });
        }
      }
      try {
        const reservedItemUUIDs = new Set<string>();
        if (ItemUUID) {
          reservedItemUUIDs.add(ItemUUID);
        }
        itemUUIDs = [ItemUUID];
        if (creationPlan.instanceCount > 1) {
          if (!ctx || typeof ctx.generateItemUUID !== 'function') {
            throw new Error('Missing generateItemUUID dependency for instance creation');
          }
          for (let index = 1; index < creationPlan.instanceCount; index += 1) {
            let candidate: string;
            try {
              candidate = await ctx.generateItemUUID(resolvedArtikelNummer || incomingArtikelNummer || null);
            } catch (mintError) {
              console.error('[import-item] Failed to mint ItemUUID for additional instance', {
                ItemUUID,
                index,
                requestedQuantity,
                error: mintError
              });
              throw new Error('Failed to mint ItemUUID for instance creation');
            }
            if (!candidate) {
              console.error('[import-item] Missing ItemUUID candidate for additional instance', {
                ItemUUID,
                index,
                requestedQuantity
              });
              throw new Error('Failed to mint ItemUUID for instance creation');
            }
            try {
              const unique = await ensureUniqueItemUUID(candidate, ctx, { reserved: reservedItemUUIDs });
              itemUUIDs.push(unique);
              reservedItemUUIDs.add(unique);
            } catch (uniqueError) {
              console.error('[import-item] Failed to ensure unique ItemUUID for additional instance', {
                ItemUUID,
                candidate,
                index,
                requestedQuantity,
                error: uniqueError
              });
              throw new Error('Failed to mint ItemUUID for instance creation');
            }
          }
        }
      } catch (instanceError) {
        console.error('[import-item] Failed to resolve ItemUUIDs for item creation', {
          ItemUUID,
          requestedQuantity,
          instanceCount: creationPlan.instanceCount,
          error: instanceError
        });
        return sendJson(res, 500, { error: 'Failed to mint ItemUUIDs for item import' });
      }
      const finalInstanceCount = itemUUIDs.length;
      if (creationPlan.mode === 'instance' && !isUpdateRequest && finalInstanceCount !== requestedQuantity) {
        console.warn('[import-item] Final instance count did not match requested quantity for non-bulk import', {
          ItemUUID,
          requestedQuantity,
          finalInstanceCount
        });
      }
      if (finalInstanceCount > 1 || requestedQuantity > 1) {
        console.info('[import-item] Final instance count resolved for import', {
          ItemUUID,
          requestedQuantity,
          finalInstanceCount,
          mode: creationPlan.mode
        });
      }

      let canonicalAgenticItemId: string | null = null;
      const artikelNummerForCanonical = resolvedArtikelNummer || incomingArtikelNummer || null;
      if (artikelNummerForCanonical) {
        try {
          const resolution = resolveCanonicalItemUUIDForArtikelnummer(artikelNummerForCanonical, {
            findByMaterial: ctx.findByMaterial,
            logger: console
          });
          canonicalAgenticItemId = resolution.itemUUID;
        } catch (canonicalErr) {
          console.error('[import-item] Failed to resolve canonical ItemUUID for agentic run', {
            artikelNummer: artikelNummerForCanonical,
            error: canonicalErr
          });
        }
      }

      if (!canonicalAgenticItemId && itemUUIDs[0]) {
        const parsedCandidate = parseSequentialItemUUID(itemUUIDs[0]);
        if (
          parsedCandidate?.kind === 'artikelnummer'
          && parsedCandidate.artikelNummer === (artikelNummerForCanonical || '')
          && parsedCandidate.sequence === 1
        ) {
          canonicalAgenticItemId = itemUUIDs[0];
          console.info('[import-item] Falling back to newly minted canonical ItemUUID for agentic run', {
            ItemUUID: itemUUIDs[0],
            artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null
          });
        }
      }

      if (!canonicalAgenticItemId) {
        console.warn('[import-item] Failed to resolve canonical ItemUUID for agentic run seeding', {
          ItemUUID: itemUUIDs[0] ?? null,
          artikelNummer: resolvedArtikelNummer || incomingArtikelNummer || null
        });
      }

      let hasExistingAgenticRun = false;
      if (canonicalAgenticItemId && ctx.getAgenticRun?.get) {
        try {
          const existingRun = ctx.getAgenticRun.get(canonicalAgenticItemId) as { Status?: string | null } | undefined;
          if (existingRun) {
            hasExistingAgenticRun = true;
          }
        } catch (agenticLookupErr) {
          console.error('[import-item] Failed to load existing agentic run for canonical reference', {
            ItemUUID: canonicalAgenticItemId,
            error: agenticLookupErr
          });
        }
      }

      const hasCanonicalInRequest =
        Boolean(canonicalAgenticItemId) && itemUUIDs.includes(canonicalAgenticItemId || '');
      const shouldSeedAgenticRun =
        !isUpdateRequest
        && !hadExistingInstanceForArtikel
        && !hasExistingAgenticRun
        && hasCanonicalInRequest;
      const shouldTriggerAgenticRun = shouldSeedAgenticRun && !agenticRunManuallySkipped;
      const agenticSeedItemId = shouldSeedAgenticRun ? canonicalAgenticItemId : null;
      const agenticSeedReason = isUpdateRequest
        ? 'update-request'
        : hadExistingInstanceForArtikel
          ? 'existing-instance'
          : hasExistingAgenticRun
            ? 'existing-agentic-run'
            : !canonicalAgenticItemId
              ? 'missing-canonical'
              : !hasCanonicalInRequest
                ? 'canonical-outside-request'
                : null;

      if (!agenticSeedItemId) {
        console.info('[import-item] Agentic seed skipped for import', {
          ItemUUID: canonicalAgenticItemId ?? itemUUIDs[0] ?? null,
          artikelNummer: resolvedArtikelNummer ?? incomingArtikelNummer ?? null,
          reason: agenticSeedReason ?? 'unknown',
          instanceCount: itemUUIDs.length
        });
        if (hasExistingAgenticRun && canonicalAgenticItemId) {
          console.info('[import-item] Agentic run skipped because canonical run already exists', {
            ItemUUID: canonicalAgenticItemId,
            artikelNummer: resolvedArtikelNummer ?? incomingArtikelNummer ?? null
          });
        }
      }

      const txn = ctx.db.transaction(
        (
          boxId: string | null,
          itemDataList: Array<{ ItemUUID: string } & Record<string, unknown>>,
          a: string,
          search: string,
          status: string,
          boxLocation: string | null,
          boxPhotoPath: string | null,
          agenticEnabled: boolean,
          manuallySkipped: boolean,
          seedItemId: string | null
        ) => {
          if (boxId) {
            ctx.upsertBox.run({
              BoxID: boxId,
              LocationId: boxLocation,
              Label: boxLabelToPersist,
              CreatedAt: now,
              Notes: null,
              PhotoPath: boxPhotoPath,
              PlacedBy: null,
              PlacedAt: null,
              UpdatedAt: now
            });
          } else {
            console.info('[import-item] Skipping box upsert because the item is unplaced', {
              ItemUUID: itemDataList[0]?.ItemUUID,
              Actor: a
            });
          }
          try {
            for (const itemData of itemDataList) {
              ctx.persistItemWithinTransaction(itemData);
              const shouldPersistAgenticRun = Boolean(seedItemId && itemData.ItemUUID === seedItemId);

              let itemExists: { ItemUUID: string } | undefined;
              if (!isUpdateRequest) {
                try {
                  itemExists = ctx.getItem.get(itemData.ItemUUID) as { ItemUUID: string } | undefined;
                } catch (lookupErr) {
                  console.error('[import-item] Failed to check existing item state during event logging', lookupErr);
                }
              }
              const eventType = isUpdateRequest || itemExists ? 'Updated' : 'Created';
              ctx.logEvent({
                Actor: a,
                EntityType: 'Item',
                EntityId: itemData.ItemUUID,
                Event: eventType,
                Meta: JSON.stringify({ BoxID: boxId })
              });
              if (shouldPersistAgenticRun) {
                let previousAgenticRun: { Status?: string | null } | null = null;
                if (!manuallySkipped) {
                  try {
                    previousAgenticRun = ctx.getAgenticRun?.get
                      ? ((ctx.getAgenticRun.get(itemData.ItemUUID) as { Status?: string | null } | undefined) ?? null)
                      : null;
                  } catch (agenticLookupErr) {
                    console.error('[import-item] Failed to load existing agentic run before upsert', agenticLookupErr);
                  }
                }

                const agenticRun = {
                  ItemUUID: itemData.ItemUUID,
                  SearchQuery: search || null,
                  Status: status,
                  LastModified: now,
                  ReviewState: 'not_required',
                  ReviewedBy: null,
                  LastReviewDecision: null,
                  LastReviewNotes: null
                };

                try {
                  ctx.upsertAgenticRun.run(agenticRun);
                } catch (agenticPersistErr) {
                  console.error('[import-item] Failed to upsert agentic run during import transaction', agenticPersistErr);
                  throw agenticPersistErr;
                }
                if (manuallySkipped) {
                  console.info('[import-item] Agentic run persisted as notStarted due to manual submission', {
                    ItemUUID: itemData.ItemUUID,
                    Actor: a,
                    agenticManualFallback
                  });
                } else {
                  const agenticEventMeta = {
                    SearchQuery: search,
                    Status: status,
                    QueuedLocally: true,
                    RemoteTriggerDispatched: Boolean(agenticEnabled)
                  };
                  const previousStatus = (previousAgenticRun?.Status || '').toLowerCase();
                  const shouldEmitAgenticQueuedEvent =
                    !previousAgenticRun || previousStatus !== AGENTIC_RUN_STATUS_QUEUED;

                  if (shouldEmitAgenticQueuedEvent) {
                    ctx.logEvent({
                      Actor: a,
                      EntityType: 'Item',
                      EntityId: itemData.ItemUUID,
                      Event: 'AgenticSearchQueued',
                      Meta: JSON.stringify(agenticEventMeta)
                    });
                  } else {
                    console.info('[import-item] Skipping AgenticSearchQueued log for already queued run', {
                      ItemUUID: itemData.ItemUUID,
                      Actor: a
                    });
                  }
                  if (!agenticEnabled) {
                    console.info('[import-item] Agentic service disabled; queued agentic run locally without remote trigger', {
                      ItemUUID: itemData.ItemUUID,
                      Actor: a,
                      SearchQuery: search
                    });
                  }
                }
              }
            }
          } catch (persistError) {
            console.error('[import-item] Failed to persist item instances during import transaction', {
              error: persistError
            });
            throw persistError;
          }
        }
      );
      const itemDataList = itemUUIDs.map((uuid) => ({
        ...data,
        ItemUUID: uuid,
        Auf_Lager: creationPlan.quantityPerItem
      }));
      txn(
        BoxID,
        itemDataList,
        actor,
        agenticSearchQuery,
        agenticStatus,
        boxLocationIdToPersist,
        preservedBoxPhotoPath,
        Boolean(ctx.agenticServiceEnabled),
        agenticRunManuallySkipped,
        agenticSeedItemId
      );

      console.info('[import-item] Persisted item instances for import', {
        mode: creationPlan.mode,
        requestedQuantity,
        createdCount: itemUUIDs.length,
        ItemUUID: itemUUIDs[0]
      });

      let agenticTriggerDispatched = false;

      if (shouldSeedAgenticRun && agenticRunManuallySkipped) {
        console.info('[import-item] Agentic trigger skipped due to manual submission status', {
          ItemUUID: agenticSeedItemId ?? null,
          actor
        });
      }

      const itemIdsToTrigger = shouldTriggerAgenticRun && agenticSeedItemId ? [agenticSeedItemId] : [];
      for (const itemId of itemIdsToTrigger) {
        try {
          const persistedAgenticRun = ctx.getAgenticRun?.get
            ? ((ctx.getAgenticRun.get(itemId) as { ItemUUID?: string; SearchQuery?: string | null } | undefined) ?? null)
            : null;
          if (!persistedAgenticRun) {
            console.warn('[import-item] Agentic run missing immediately after import transaction', {
              ItemUUID: itemId,
              actor,
              agenticStatus
            });
          } else if (!persistedAgenticRun.SearchQuery && agenticSearchQuery) {
            console.info('[import-item] Agentic run persisted without search query; confirming ingestion state', {
              ItemUUID: itemId,
              actor
            });
          }
        } catch (agenticPostPersistErr) {
          console.error('[import-item] Failed to verify agentic run presence after import', agenticPostPersistErr);
        }

        if (ctx.agenticServiceEnabled && !agenticRunManuallySkipped) {
          const triggerPayload = {
            itemId,
            artikelbeschreibung: agenticSearchQuery || data.Artikelbeschreibung || ''
          };

          if (!triggerPayload.artikelbeschreibung) {
            console.warn('[import-item] Agentic trigger skipped due to missing Artikelbeschreibung', {
              ItemUUID: itemId,
              actor
            });
          } else {
            try {
              agenticTriggerDispatched = true;
              void forwardAgenticTrigger(triggerPayload, {
                context: 'import-item',
                logger: console,
                service: {
                  db: ctx.db,
                  getAgenticRun: ctx.getAgenticRun,
                  upsertAgenticRun: ctx.upsertAgenticRun,
                  updateAgenticRunStatus: ctx.updateAgenticRunStatus,
                  logEvent: ctx.logEvent,
                  findByMaterial: ctx.findByMaterial,
                  logger: console,
                  now: () => new Date(),
                  invokeModel: ctx.agenticInvokeModel
                }
              })
                .then((result) => {
                  if (!result.ok) {
                    console.error('[import-item] Agentic trigger response indicated failure', {
                      ItemUUID: itemId,
                      status: result.status,
                      details: result.body ?? result.rawBody
                    });
                  }
                })
                .catch((agenticErr) => {
                  console.error('[import-item] Failed to trigger agentic run after import', agenticErr);
                });
            } catch (dispatchErr) {
              console.error('[import-item] Failed to schedule agentic trigger dispatch', dispatchErr);
            }
          }
        } else if (ctx.agenticServiceEnabled && agenticRunManuallySkipped) {
          console.info('[import-item] Agentic trigger skipped due to manual submission status', {
            ItemUUID: itemId,
            actor
          });
        } else {
          console.info('[import-item] Agentic service disabled; queued agentic run locally and skipped remote trigger dispatch', {
            ItemUUID: itemId,
            actor,
            agenticSearchQuery
          });
        }
      }

      // TODO(import-item): Confirm multi-instance response payload stays aligned with Item contracts.
      // TODO(agent): Re-audit import response payload fields during next contract alignment review.
      let responseArtikelNummer: string | null = data.Artikel_Nummer || null;
      let responseBoxId: string | null = BoxID;
      try {
        const primaryItemUUID = itemUUIDs[0];
        const persistedItem = ctx.getItem?.get
          ? ((ctx.getItem.get(primaryItemUUID) as { Artikel_Nummer?: string | null; BoxID?: string | null } | undefined) ??
              null)
          : null;
        if (persistedItem) {
          if (persistedItem.Artikel_Nummer) {
            responseArtikelNummer = persistedItem.Artikel_Nummer;
          }
          if (typeof persistedItem.BoxID !== 'undefined') {
            responseBoxId = persistedItem.BoxID ?? responseBoxId;
          }
          if (
            persistedItem.Artikel_Nummer &&
            data.Artikel_Nummer &&
            persistedItem.Artikel_Nummer !== data.Artikel_Nummer
          ) {
            console.warn('[import-item] Persisted Artikel_Nummer differs from normalized payload after import', {
              ItemUUID: primaryItemUUID,
              persisted: persistedItem.Artikel_Nummer,
              normalized: data.Artikel_Nummer
            });
          }
        } else {
          console.warn('[import-item] Unable to load persisted item after import for response payload', {
            ItemUUID: primaryItemUUID
          });
        }
      } catch (responseItemError) {
        console.error('[import-item] Failed to read persisted item for response payload', {
          ItemUUID: itemUUIDs[0],
          error: responseItemError
        });
      }

      if (!responseArtikelNummer) {
        console.warn('[import-item] Missing Artikel_Nummer for import response payload', {
          ItemUUID,
          BoxID: responseBoxId
        });
      }

      const responseItems = itemUUIDs.map((uuid) => ({
        ItemUUID: uuid,
        BoxID: responseBoxId,
        Artikel_Nummer: responseArtikelNummer
      }));
      if (responseItems.length > 1) {
        console.info('[import-item] Multi-instance import response prepared', {
          primaryItemUUID: responseItems[0]?.ItemUUID,
          itemUUIDs: responseItems.map((item) => item.ItemUUID),
          createdCount: responseItems.length
        });
      }
      sendJson(res, 200, {
        ok: true,
        item: responseItems[0],
        items: responseItems,
        createdCount: responseItems.length,
        agenticTriggerDispatched
      });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
});

export default action;
