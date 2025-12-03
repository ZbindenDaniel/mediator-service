import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
// TODO(agent): Capture structured Langtext ingestion telemetry to validate helper fallbacks before removing string pathways.
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  ItemEinheit,
  ItemRef,
  resolveAgenticRunStatus,
  isItemEinheit
} from '../../models';
import type { AgenticRunStatus } from '../../models';
import { defineHttpAction } from './index';
import { resolveStandortLabel, normalizeStandortCode } from '../standort-label';
import { forwardAgenticTrigger } from './agentic-trigger';
import { generateItemUUID } from '../lib/itemIds';
import { MEDIA_DIR } from '../lib/media';
import { parseLangtext } from '../lib/langtext';
import { IMPORT_DATE_FIELD_PRIORITIES } from '../importer';
import { resolveCategoryLabelToCode } from '../lib/categoryLabelLookup';

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

// TODO(agent): Consolidate ItemUUID collision handling into a shared allocator helper for reuse across actions.
// TODO(agent): Normalize getItem.get to a consistent sync/async contract to simplify uniqueness checks.
async function ensureUniqueItemUUID(candidate: string, ctx: any): Promise<string> {
  const maxAttempts = 3;
  let attempt = 0;
  let itemUUID = candidate;

  while (attempt < maxAttempts) {
    let existing: unknown = null;
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

    if (!existing) {
      return itemUUID;
    }

    attempt += 1;
    console.warn('[import-item] Detected ItemUUID collision while minting; retrying with fresh identifier', {
      attempt,
      itemUUID
    });

    try {
      itemUUID = await ctx.generateItemUUID();
    } catch (regenError) {
      console.error('[import-item] Failed to remint ItemUUID after collision', {
        attempt,
        previousItemUUID: itemUUID,
        error: regenError
      });
      break;
    }
  }

  throw new Error('Failed to mint a unique ItemUUID for import');
}

function coalesceEinheit(value: string | null): ItemEinheit {
  const raw = value ?? '';
  const trimmed = raw.trim();
  try {
    if (isItemEinheit(trimmed)) {
      return trimmed;
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
      normalized.Langtext = parsedLangtext;
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
  if (typeof record.Einheit === 'string' && isItemEinheit(record.Einheit)) {
    normalized.Einheit = record.Einheit;
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
          mintedUUID = await ctx.generateItemUUID();
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
              mintedUUID = await ctx.generateItemUUID();
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
        const dir = path.join(MEDIA_DIR, ItemUUID);
        fs.mkdirSync(dir, { recursive: true });
        const artNr = resolvedArtikelNummer || ItemUUID;
        images.forEach((img, idx) => {
          if (!img) return;
          const m = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${artNr}-${idx + 1}.${ext}`;
          fs.writeFileSync(path.join(dir, file), buf);
          if (!firstImage) firstImage = `/media/${ItemUUID}/${file}`;
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
      const langtext = parsedLangtextInput ?? fallbackLangtext;
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

      const data = {
        BoxID,
        ItemUUID,
        Location: normalizedLocation,
        UpdatedAt: nowDate,
        Datum_erfasst: datumErfasst,
        Artikel_Nummer: resolvedArtikelNummer,
        Grafikname: firstImage || referenceDefaults?.Grafikname || '',
        Artikelbeschreibung: artikelbeschreibung,
        Auf_Lager: parseInt((p.get('Auf_Lager') || '1').trim(), 10) || 1,
        Verkaufspreis: verkaufspreis,
        Kurzbeschreibung: kurzbeschreibung,
        Langtext: langtext,
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

      const agenticSearchQuery = (p.get('agenticSearch') || data.Artikelbeschreibung || '').trim();
      const requestedStatus = (p.get('agenticStatus') || '').trim();
      const manualFallbackFlag = (p.get('agenticManualFallback') || '').trim().toLowerCase();
      const agenticManualFallback = manualFallbackFlag === 'true';
      const resolvedAgenticStatus: AgenticRunStatus = resolveAgenticRunStatus(requestedStatus);
      const agenticStatus: AgenticRunStatus = agenticManualFallback
        ? AGENTIC_RUN_STATUS_NOT_STARTED
        : resolvedAgenticStatus;
      const agenticRunManuallySkipped = agenticManualFallback || agenticStatus === AGENTIC_RUN_STATUS_NOT_STARTED;

      // TODO(agentic-ingestion-audit): Capture structured metrics for agentic run registration during imports to validate start coverage.

      let boxLocationToPersist: string | null = normalizedLocation || null;
      let boxStandortLabelToPersist: string | null = requestedStandortLabel;
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
                  Location?: string | null;
                  StandortLabel?: string | null;
                  PhotoPath?: string | null;
                } | undefined)
              : undefined;
            if (existingBox?.Location) {
              boxLocationToPersist = existingBox.Location;
              boxStandortLabelToPersist = existingBox.StandortLabel ?? resolveStandortLabel(existingBox.Location);
              preservedBoxPhotoPath = existingBox.PhotoPath ?? null;
              console.info('[import-item] Preserved existing box Location', { BoxID, Location: existingBox.Location });
            } else {
              boxLocationToPersist = null;
              boxStandortLabelToPersist = null;
              console.info('[import-item] No existing Location found to preserve for box', { BoxID });
            }
          } catch (lookupErr) {
            console.error('[import-item] Failed to load box while preserving Location', lookupErr);
          }
        }
      } else {
        boxLocationToPersist = null;
        boxStandortLabelToPersist = null;
      }

      const txn = ctx.db.transaction(
        (
          boxId: string | null,
          itemData: any,
          a: string,
          search: string,
          status: string,
          boxLocation: string | null,
          boxPhotoPath: string | null,
          agenticEnabled: boolean,
          manuallySkipped: boolean
        ) => {
          if (boxId) {
            ctx.upsertBox.run({
              BoxID: boxId,
              Location: boxLocation,
              StandortLabel: boxStandortLabelToPersist,
              CreatedAt: now,
              Notes: null,
              PhotoPath: boxPhotoPath,
              PlacedBy: null,
              PlacedAt: null,
              UpdatedAt: now
            });
          } else {
            console.info('[import-item] Skipping box upsert because the item is unplaced', {
              ItemUUID: itemData.ItemUUID,
              Actor: a
            });
          }
          ctx.persistItemWithinTransaction(itemData);

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
      );
      txn(
        BoxID,
        { ...data, ItemUUID },
        actor,
        agenticSearchQuery,
        agenticStatus,
        boxLocationToPersist,
        preservedBoxPhotoPath,
        Boolean(ctx.agenticServiceEnabled),
        agenticRunManuallySkipped
      );

      let agenticTriggerDispatched = false;

      try {
        const persistedAgenticRun = ctx.getAgenticRun?.get
          ? ((ctx.getAgenticRun.get(ItemUUID) as { ItemUUID?: string; SearchQuery?: string | null } | undefined) ?? null)
          : null;
        if (!persistedAgenticRun) {
          console.warn('[import-item] Agentic run missing immediately after import transaction', {
            ItemUUID,
            actor,
            agenticStatus
          });
        } else if (!persistedAgenticRun.SearchQuery && agenticSearchQuery) {
          console.info('[import-item] Agentic run persisted without search query; confirming ingestion state', {
            ItemUUID,
            actor
          });
        }
      } catch (agenticPostPersistErr) {
        console.error('[import-item] Failed to verify agentic run presence after import', agenticPostPersistErr);
      }

      if (ctx.agenticServiceEnabled && !agenticRunManuallySkipped) {
        const triggerPayload = {
          itemId: ItemUUID,
          artikelbeschreibung: agenticSearchQuery || data.Artikelbeschreibung || ''
        };

        if (!triggerPayload.artikelbeschreibung) {
          console.warn('[import-item] Agentic trigger skipped due to missing Artikelbeschreibung', {
            ItemUUID,
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
                logger: console,
                now: () => new Date(),
                invokeModel: ctx.agenticInvokeModel
              }
            })
              .then((result) => {
                if (!result.ok) {
                  console.error('[import-item] Agentic trigger response indicated failure', {
                    ItemUUID,
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
          ItemUUID,
          actor
        });
      } else {
        console.info('[import-item] Agentic service disabled; queued agentic run locally and skipped remote trigger dispatch', {
          ItemUUID,
          actor,
          agenticSearchQuery
        });
      }

      sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID }, agenticTriggerDispatched });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
});

export default action;
