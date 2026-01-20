import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import type { IncomingMessage, ServerResponse } from 'http';
import { LANGTEXT_EXPORT_FORMAT, PUBLIC_ORIGIN } from '../config';
import { ItemEinheit, normalizeItemEinheit } from '../../models';
import type { LangtextPayload } from '../../models';
import { describeQuality } from '../../models/quality';
import { CategoryFieldType, resolveCategoryCodeToLabel } from '../lib/categoryLabelLookup';
import { parseLangtext, serializeLangtextForExport } from '../lib/langtext';
import { MEDIA_DIR } from '../lib/media';
import { defineHttpAction } from './index';
import { collectMediaAssets, isAllowedMediaAsset } from './save-item';

// TODO(agent): Monitor ZIP export throughput once media directories grow to validate stream backpressure handling.
// TODO(agent): Ensure export serializer stays reusable for ERP sync actions to avoid diverging payload formats.
// TODO(agent): Normalize category fields to canonical labels once lookup utilities support code-to-name mapping.
// TODO(agent): Confirm Artikel-Nummer zero-padding requirements remain at six digits for ERP exports.
// TODO(agent): Verify export/import header alias parity when adding metadata columns.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// TODO(agent): Keep exporter metadata parity intact when partner CSV specs change.
// TODO(agent): Remove ImageNames fallback once disk-backed assets are guaranteed for exports.
// TODO(export-items): Keep this header order in sync with partner CSV specs tracked in docs when they change.
// TODO(agent): Mirror header label updates in importer alias definitions to avoid ingest/export drift.
// TODO(agent): Harden exporter media listings against document artifacts slipping into partner feeds.
const columnDescriptors = [
  { key: 'partnumber', header: 'Artikel-Nummer', field: 'Artikel_Nummer' },
  { key: 'type_and_classific', header: 'Artikeltyp', field: 'Artikeltyp' },
  { key: 'entrydate', header: 'CreatedAt', field: 'Datum_erfasst' },
  { key: 'image_names', header: 'Grafikname(n)', field: 'Grafikname' },
  { key: 'description', header: 'Artikelbeschreibung', field: 'Artikelbeschreibung' },
  { key: 'notes', header: 'Kurzbeschreibung', field: 'Kurzbeschreibung' },
  { key: 'longdescription', header: 'Langtext', field: 'Langtext' },
  { key: 'manufacturer', header: 'Hersteller', field: 'Hersteller' },
  { key: 'length_mm', header: 'Länge(mm)', field: 'Länge_mm' },
  { key: 'width_mm', header: 'Breite(mm)', field: 'Breite_mm' },
  { key: 'height_mm', header: 'Höhe(mm)', field: 'Höhe_mm' },
  { key: 'weight_kg', header: 'Gewicht(kg)', field: 'Gewicht_kg' },
  { key: 'sellprice', header: 'Verkaufspreis', field: 'Verkaufspreis' },
  { key: 'onhand', header: 'Auf Lager', field: 'Auf_Lager' },
  { key: 'published_status', header: 'Veröffentlicht_Status', field: 'Veröffentlicht_Status' },
  { key: 'shoparticle', header: 'Shopartikel', field: 'Shopartikel' },
  { key: 'unit', header: 'Einheit', field: 'Einheit' },
  { key: 'ean', header: 'EAN', field: null },
  {
    key: 'cvar_categories_A1',
    header: 'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
    field: 'Hauptkategorien_A'
  },
  {
    key: 'cvar_categories_A2',
    header: 'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
    field: 'Unterkategorien_A'
  },
  {
    key: 'cvar_categories_B1',
    header: 'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
    field: 'Hauptkategorien_B'
  },
  {
    key: 'cvar_categories_B2',
    header: 'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
    field: 'Unterkategorien_B'
  },
  { key: 'itemUUID', header: 'ItemUUID', field: 'ItemUUID' },
  { key: 'BoxID', header: 'BoxID', field: 'BoxID' },
  { key: 'LocationId', header: 'Location', field: 'LocationId' },
  { key: 'Label', header: 'Label', field: 'Label' },
  { key: 'UpdatedAt', header: 'UpdatedAt', field: 'UpdatedAt' }
] as const;

type ExportColumnDescriptor = (typeof columnDescriptors)[number];
type ExportColumn = ExportColumnDescriptor['key'];

const metadataColumns = columnDescriptors
  .filter((descriptor) => ['itemUUID', 'BoxID', 'LocationId', 'Label', 'UpdatedAt'].includes(descriptor.key))
  .map((descriptor) => descriptor.key as ExportColumn);

const columns = columnDescriptors.map((descriptor) => descriptor.key) as readonly ExportColumn[];
const columnHeaderMap = new Map<ExportColumn, string>(
  columnDescriptors.map((descriptor) => [descriptor.key, descriptor.header])
);

const boxColumns = [
  'BoxID',
  'LocationId',
  'Label',
  'CreatedAt',
  'Notes',
  'PhotoPath',
  'PlacedBy',
  'PlacedAt',
  'UpdatedAt'
] as const;

// TODO(agent): Replace CSV-specific Langtext serialization once exports move to typed clients.
// TODO(langtext-export): Align CSV Langtext serialization with downstream channel requirements when available.

const metadataColumnSet = new Set<ExportColumn>(metadataColumns as readonly ExportColumn[]);
const categoryFieldTypes: Record<string, CategoryFieldType> = {
  Hauptkategorien_A: 'haupt',
  Hauptkategorien_B: 'haupt',
  Unterkategorien_A: 'unter',
  Unterkategorien_B: 'unter',
};

const fieldMap: Record<ExportColumn, string | null> = columnDescriptors.reduce(
  (acc, descriptor) => ({ ...acc, [descriptor.key]: descriptor.field }),
  {} as Record<ExportColumn, string | null>
);

const missingFieldWarnings = new Set<ExportColumn>();
const missingMetadataValueWarnings = new Set<ExportColumn>();
const categoryLabelFallbackWarnings = new Set<string>();

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;
const MEDIA_PREFIX = '/media/';
// TODO(export-items-grouping): Confirm whether grouped exports should omit the ItemUUID column entirely once consumers allow it.
// TODO(export-items-grouping): Validate export consumers accept ItemUUID column removal when grouping merges rows.
// TODO(export-items-mode): Confirm default export mode expectations with ERP/backup consumers.

type ExportMode = 'backup' | 'erp';
const EXPORT_MODES = new Set<ExportMode>(['backup', 'erp']);

function formatArtikelnummerForExport(value: unknown, itemUUID: string | null): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        console.warn('[export-items] Artikel-Nummer was non-finite number during export; leaving as-is.', {
          itemUUID,
          provided: value
        });
        return value;
      }
      const integerValue = Math.trunc(value);
      const formatted = String(integerValue).padStart(6, '0');
      if (formatted.length > 6) {
        console.warn('[export-items] Artikel-Nummer exceeds 6 digits during export; retaining full value.', {
          itemUUID,
          provided: value,
          formatted
        });
      }
      return formatted;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return trimmed;
      }
      if (/^\d+$/u.test(trimmed)) {
        const formatted = trimmed.padStart(6, '0');
        if (formatted.length > 6) {
          console.warn('[export-items] Artikel-Nummer exceeds 6 digits during export; retaining full value.', {
            itemUUID,
            provided: trimmed,
            formatted
          });
        }
        return formatted;
      }
    }
  } catch (error) {
    console.error('[export-items] Failed to format Artikel-Nummer for export; leaving as-is.', {
      itemUUID,
      provided: value,
      error
    });
  }

  return value;
}

export interface ItemsExportArtifact {
  archivePath: string;
  boxesPath: string;
  cleanup: () => Promise<void>;
  itemsPath: string;
  kind: 'csv' | 'zip';
  tempDir: string;
}

export interface StageItemsExportOptions {
  archiveBaseName?: string;
  boxes: Record<string, unknown>[];
  exportMode: ExportMode;
  includeMedia: boolean;
  items: Record<string, unknown>[];
  logger?: Pick<Console, 'error' | 'info' | 'warn'>;
  mediaDir?: string;
}

function filterExistingMediaAssets(assets: string[]): string[] {
  const filtered: string[] = [];
  for (const asset of assets) {
    if (typeof asset !== 'string') {
      continue;
    }
    const trimmed = asset.trim();
    if (!trimmed) {
      continue;
    }
    if (!isAllowedMediaAsset(trimmed)) {
      console.info('[export-items] Skipping non-image media asset during export serialization', { asset: trimmed });
      continue;
    }
    if (!trimmed.startsWith(MEDIA_PREFIX)) {
      filtered.push(trimmed);
      continue;
    }
    const relative = trimmed.slice(MEDIA_PREFIX.length);
    const absolute = path.join(MEDIA_DIR, relative);
    if (!absolute.startsWith(MEDIA_DIR)) {
      console.warn('[export-items] Refused to include media asset outside MEDIA_DIR during export', {
        asset: trimmed,
        resolved: absolute,
      });
      continue;
    }
    try {
      if (fs.existsSync(absolute)) {
        filtered.push(trimmed);
      } else {
        console.info('[export-items] Media asset missing on disk during export serialization', {
          asset: trimmed,
          resolved: absolute,
        });
      }
    } catch (error) {
      console.error('[export-items] Failed to verify media asset existence for export', {
        asset: trimmed,
        error,
      });
    }
  }
  return filtered;
}

function normalizeCategoryValueForExport(field: string, rawValue: unknown): unknown {
  const fieldType: CategoryFieldType | undefined = categoryFieldTypes[field];
  if (!fieldType) {
    return rawValue;
  }

  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }

  let numericValue: number | null = null;
  if (typeof rawValue === 'number') {
    numericValue = rawValue;
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return rawValue;
    }
    if (!/^-?\d+$/u.test(trimmed)) {
      return rawValue;
    }
    const parsed = Number.parseInt(trimmed, 10);
    numericValue = Number.isFinite(parsed) ? parsed : null;
  }

  if (numericValue === null) {
    return rawValue;
  }

  try {
    const resolvedLabel = resolveCategoryCodeToLabel(numericValue, fieldType);
    if (resolvedLabel) {
      return resolvedLabel;
    }
    if (!categoryLabelFallbackWarnings.has(field)) {
      categoryLabelFallbackWarnings.add(field);
      console.warn('[export-items] Missing category label for code during export; retaining numeric value.', {
        field,
        code: numericValue,
      });
    }
  } catch (error) {
    console.error('[export-items] Failed to resolve category label for export; retaining numeric value.', {
      field,
      code: numericValue,
      error,
    });
  }

  return numericValue;
}

function normalizeExportGroupingValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return String(value);
}

function resolveExportGroupingLocation(row: Record<string, unknown>): string {
  const location = typeof row.Location === 'string' ? row.Location : null;
  const locationId = typeof row.LocationId === 'string' ? row.LocationId : null;
  return normalizeExportGroupingValue(location ?? locationId);
}

function buildExportGroupingKey(row: Record<string, unknown>, index: number): string {
  const artikelNummer = normalizeExportGroupingValue(row.Artikel_Nummer);
  const itemUUID = normalizeExportGroupingValue(row.ItemUUID);
  const quality = normalizeExportGroupingValue(row.Quality);
  const boxId = normalizeExportGroupingValue(row.BoxID);
  const location = resolveExportGroupingLocation(row);
  const identifier = artikelNummer || itemUUID || `row-${index}`;
  return [identifier, quality || 'unknown', boxId, location].join('::');
}

function coerceNumericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveLatestTimestamp(primary: unknown, candidate: unknown): unknown {
  const primaryValue = typeof primary === 'string' ? Date.parse(primary) : NaN;
  const candidateValue = typeof candidate === 'string' ? Date.parse(candidate) : NaN;
  if (!Number.isNaN(primaryValue) && !Number.isNaN(candidateValue)) {
    return candidateValue > primaryValue ? candidate : primary;
  }
  return primary ?? candidate;
}

function resolveFallbackValue(primary: unknown, fallback: unknown): unknown {
  if (primary !== null && primary !== undefined && primary !== '') {
    return primary;
  }
  if (fallback !== null && fallback !== undefined && fallback !== '') {
    return fallback;
  }
  return primary ?? fallback;
}

function groupExportRows(
  rows: Record<string, unknown>[],
  logger: Pick<Console, 'error' | 'info' | 'warn'> = console
): {
  groupedRows: Record<string, unknown>[];
  inputCount: number;
  mergedCount: number;
  clearedGroupedItemUUIDs: number;
} {
  const grouped = new Map<
    string,
    { row: Record<string, unknown>; itemUUIDs: Set<string> }
  >();
  let mergedCount = 0;

  rows.forEach((row, index) => {
    const key = buildExportGroupingKey(row, index);
    const itemUUID = typeof row.ItemUUID === 'string' ? row.ItemUUID.trim() : '';
    const existing = grouped.get(key);
    if (!existing) {
      const itemUUIDs = new Set<string>();
      if (itemUUID) {
        itemUUIDs.add(itemUUID);
      }
      grouped.set(key, { row: { ...row }, itemUUIDs });
      return;
    }

    mergedCount += 1;
    if (itemUUID) {
      existing.itemUUIDs.add(itemUUID);
    }

    const existingOnHand = coerceNumericValue(existing.row.Auf_Lager);
    const incomingOnHand = coerceNumericValue(row.Auf_Lager);
    if (existingOnHand !== null && incomingOnHand !== null) {
      existing.row.Auf_Lager = existingOnHand + incomingOnHand;
    } else if (existingOnHand === null && incomingOnHand !== null) {
      existing.row.Auf_Lager = incomingOnHand;
    }

    existing.row.UpdatedAt = resolveLatestTimestamp(existing.row.UpdatedAt, row.UpdatedAt);
    existing.row.BoxID = resolveFallbackValue(existing.row.BoxID, row.BoxID);
    existing.row.Location = resolveFallbackValue(existing.row.Location, row.Location ?? row.LocationId);
    existing.row.Label = resolveFallbackValue(existing.row.Label, row.Label);
  });

  let clearedGroupedItemUUIDs = 0;
  const groupedRows = Array.from(grouped.values()).map((entry) => {
    try {
      if (entry.itemUUIDs.size > 1) {
        clearedGroupedItemUUIDs += 1;
        entry.row.ItemUUID = '';
        logger.warn?.('[export-items] Clearing ItemUUID for grouped export row to avoid inconsistent instance references.', {
          artikelNummer: entry.row.Artikel_Nummer ?? null,
          boxId: entry.row.BoxID ?? null,
          location: entry.row.Location ?? entry.row.LocationId ?? null,
          itemUUIDCount: entry.itemUUIDs.size,
          itemUUIDs: Array.from(entry.itemUUIDs)
        });
      } else if (entry.itemUUIDs.size === 1 && !entry.row.ItemUUID) {
        entry.row.ItemUUID = Array.from(entry.itemUUIDs)[0];
      }
    } catch (normalizationError) {
      logger.error?.('[export-items] Failed to normalize grouped ItemUUID values for export.', {
        artikelNummer: entry.row.Artikel_Nummer ?? null,
        error: normalizationError
      });
    }
    return entry.row;
  });

  try {
    logger.info?.('[export-items] Grouped export rows for CSV generation', {
      inputCount: rows.length,
      groupedCount: groupedRows.length,
      mergedCount,
      clearedGroupedItemUUIDs
    });
  } catch (logError) {
    logger.error?.('[export-items] Failed to log export grouping summary', logError);
  }

  return { groupedRows, inputCount: rows.length, mergedCount, clearedGroupedItemUUIDs };
}

function parseExportMode(
  rawMode: string | null,
  logger: Pick<Console, 'error' | 'info' | 'warn'> = console
): { mode: ExportMode; source: 'default' | 'explicit' } {
  const defaultMode: ExportMode = 'backup';
  if (!rawMode) {
    return { mode: defaultMode, source: 'default' };
  }

  const trimmed = rawMode.trim();
  if (!trimmed) {
    return { mode: defaultMode, source: 'default' };
  }

  try {
    const normalized = trimmed.toLowerCase();
    if (!EXPORT_MODES.has(normalized as ExportMode)) {
      throw new Error(`Unsupported export mode: ${rawMode}`);
    }
    return { mode: normalized as ExportMode, source: 'explicit' };
  } catch (error) {
    logger.error?.('[export-items] Failed to parse export mode; expected backup or erp.', {
      rawMode,
      error
    });
    throw error;
  }
}

function toCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializeBoxes(rows: Record<string, unknown>[]): string {
  const header = boxColumns.join(',');
  const lines = rows.map((row) => boxColumns.map((column) => toCsvValue(row[column] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

export function serializeBoxesToCsv(rows: Record<string, unknown>[]): string {
  return serializeBoxes(rows);
}

function logMissingMetadataValue(
  column: ExportColumn,
  field: string,
  rawRow: Record<string, unknown>
): void {
  if (missingMetadataValueWarnings.has(column)) {
    return;
  }
  missingMetadataValueWarnings.add(column);
  const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
  try {
    console.warn('[export-items] Missing metadata value for export column; emitting blank string.', {
      column,
      field,
      itemUUID
    });
  } catch (loggingError) {
    console.error('[export-items] Failed to log missing metadata value warning', {
      column,
      field,
      loggingError
    });
  }
}

// TODO(agent): Revisit CSV media derivation when asset manifests are queryable via API.
function resolveExportValue(column: ExportColumn, rawRow: Record<string, unknown>): unknown {
  const field = fieldMap[column];
  if (!field) {
    if (!missingFieldWarnings.has(column)) {
      missingFieldWarnings.add(column);
      try {
        console.warn('[export-items] Missing field mapping for export column; emitting blank value.', { column });
      } catch (loggingError) {
        console.error('[export-items] Failed to log missing field mapping warning', { column, loggingError });
      }
    }
    return '';
  }

  let value = rawRow[field];
  value = normalizeCategoryValueForExport(field, value);

  if (field === 'Artikel_Nummer') {
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    return formatArtikelnummerForExport(value, itemUUID);
  }

  // TODO(agent): Revisit published status gating once agentic review policies evolve beyond reviewed/notReviewed.
  if (field === 'Veröffentlicht_Status') {
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const agenticStatus = typeof rawRow.AgenticStatus === 'string' ? rawRow.AgenticStatus : null;
    const storedPublished = Boolean(value);
    const gatedPublished = storedPublished && agenticStatus === 'reviewed';

    if (storedPublished && !gatedPublished) {
      console.info('[export-items] Agentic review gate suppressed published status during export.', {
        agenticStatus,
        itemUUID,
      });
    }

    return gatedPublished;
  }

  if (column === 'image_names') {
    const fallbackValue = value;
    const grafikname = typeof value === 'string' ? value : null;
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;

    if (!itemUUID) {
      console.warn('[export-items] Missing ItemUUID for media enumeration, falling back to original Grafikname.');
      return fallbackValue;
    }

    try {
      const mediaAssets = collectMediaAssets(itemUUID, grafikname, artikelNummer);
      const filteredMediaAssets = filterExistingMediaAssets(mediaAssets);
      if (Array.isArray(filteredMediaAssets) && filteredMediaAssets.length > 0) {
        return filteredMediaAssets.join('|');
      }
      if (mediaAssets.length > 0 && filteredMediaAssets.length === 0) {
        console.info('[export-items] Media assets skipped after filtering; falling back to Grafikname.', {
          itemUUID,
          artikelNummer,
          skippedAssets: mediaAssets,
        });
      }
      console.info('[export-items] No media assets discovered for export row, falling back to Grafikname.', {
        itemUUID,
        artikelNummer
      });
    } catch (error) {
      console.error('[export-items] Failed to enumerate media assets for export row, falling back to Grafikname.', {
        itemUUID,
        artikelNummer,
        error
      });
    }
    return fallbackValue;
  }

  if (metadataColumnSet.has(column)) {
    if (value === undefined) {
      logMissingMetadataValue(column, field, rawRow);
      return '';
    }
    return value;
  }

  if (field === 'Grafikname') {
    const canonicalGrafikname = typeof value === 'string' ? value : '';
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;
    let mediaAssets: string[] = [];
    if (itemUUID) {
      try {
        mediaAssets = collectMediaAssets(itemUUID, canonicalGrafikname, artikelNummer);
      } catch (error) {
        console.error('[export-items] Failed to collect media assets for CSV export; falling back to stored metadata.', {
          itemUUID,
          artikelNummer,
          error,
        });
      }
    }
    const existingMediaAssets = filterExistingMediaAssets(mediaAssets);
    if (existingMediaAssets.length > 0) {
      return existingMediaAssets.join('|');
    }
    if (mediaAssets.length > 0 && existingMediaAssets.length === 0) {
      console.info('[export-items] Media assets skipped after filtering existing files; using metadata fallbacks.', {
        itemUUID,
        artikelNummer,
        skippedAssets: mediaAssets,
      });
    }
    try {
      const storedList = typeof rawRow.ImageNames === 'string' ? rawRow.ImageNames.trim() : '';
      if (storedList) {
        console.warn('[export-items] No media files found for item; using stored ImageNames metadata.', {
          itemUUID,
          artikelNummer,
        });
        return storedList;
      }
    } catch (fallbackError) {
      console.error('[export-items] Failed to read ImageNames metadata fallback for CSV export.', {
        itemUUID,
        artikelNummer,
        error: fallbackError,
      });
    }
    return canonicalGrafikname;
  }

  if (field === 'Langtext') {
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const helperContext = {
      logger: console,
      context: `export-items:Langtext:${LANGTEXT_EXPORT_FORMAT}`,
      artikelNummer,
      itemUUID
    } as const;

    // TODO(agent): Externalize Langtext quality localization once export consumers define translation needs.
    const langtextValueForExport = (() => {
      try {
        const parsedLangtext = parseLangtext(value, helperContext);
        if (parsedLangtext && typeof parsedLangtext !== 'string') {
          try {
            const { label } = describeQuality((rawRow as Record<string, unknown>).Quality);
            const enriched: LangtextPayload = { ...parsedLangtext, Qualität: label };
            return enriched;
          } catch (qualityError) {
            console.warn(
              '[export-items] Unable to resolve quality for Langtext enrichment; exporting original payload.',
              {
                artikelNummer,
                itemUUID,
                error: qualityError
              }
            );
          }
        }
      } catch (parsingError) {
        console.error('[export-items] Failed to parse Langtext for quality enrichment during export.', {
          artikelNummer,
          itemUUID,
          error: parsingError
        });
      }

      return value;
    })();

    try {
      const serialized = serializeLangtextForExport(langtextValueForExport, LANGTEXT_EXPORT_FORMAT, helperContext);
      if (serialized !== null && serialized !== undefined) {
        return serialized;
      }

      console.warn(
        '[export-items] Langtext payload resolved to null during configured serialization; attempting fallback.',
        {
          artikelNummer,
          itemUUID,
          format: LANGTEXT_EXPORT_FORMAT
        }
      );

      if (LANGTEXT_EXPORT_FORMAT !== 'json') {
        const fallbackSerialized = serializeLangtextForExport(value, 'json', {
          ...helperContext,
          context: 'export-items:Langtext:fallback-json'
        });

        if (fallbackSerialized !== null && fallbackSerialized !== undefined) {
          console.warn('[export-items] Falling back to JSON Langtext serialization for export.', {
            artikelNummer,
            itemUUID,
            format: LANGTEXT_EXPORT_FORMAT
          });
          return fallbackSerialized;
        }
      }
    } catch (error) {
      console.error('[export-items] Failed to serialize Langtext payload for export; attempting JSON fallback.', {
        artikelNummer,
        itemUUID,
        format: LANGTEXT_EXPORT_FORMAT,
        error
      });
    }

    try {
      return JSON.stringify(value);
    } catch (fallbackError) {
      console.error('[export-items] JSON fallback failed for Langtext payload; exporting empty string.', {
        artikelNummer,
        itemUUID,
        format: LANGTEXT_EXPORT_FORMAT,
        error: fallbackError
      });
      return '';
    }
  }

  if (field !== 'Einheit') {
    return value;
  }
  try {
    const normalized = normalizeItemEinheit(value);
    if (normalized) {
      return normalized;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      console.warn('[export-items] Invalid Einheit value encountered during export, falling back to default.', {
        provided: value
      });
    } else if (value !== null && value !== undefined) {
      console.warn('[export-items] Unexpected Einheit type encountered during export, falling back to default.', {
        providedType: typeof value
      });
    }
  } catch (error) {
    console.error('[export-items] Failed to normalize Einheit for export, using default.', error);
  }
  return DEFAULT_EINHEIT;
}

export function serializeItemsToCsv(
  rows: Record<string, unknown>[],
  exportColumns: readonly ExportColumn[] = columns
): { csv: string; columns: readonly ExportColumn[] } {
  const header = exportColumns.map((column) => columnHeaderMap.get(column) ?? column).join(',');
  const lines = rows.map((row: any) =>
    exportColumns
      .map((column: ExportColumn) => {
        const resolvedValue = resolveExportValue(column, row);
        return toCsvValue(resolvedValue);
      })
      .join(',')
  );
  return {
    csv: [header, ...lines].join('\n'),
    columns: exportColumns
  };
}

interface ZipArchiveOptions {
  archiveName: string;
  cwd: string;
  entries: string[];
  logger: Pick<Console, 'error' | 'info' | 'warn'>;
}

async function createZipArchive(options: ZipArchiveOptions): Promise<void> {
  const { archiveName, cwd, entries, logger } = options;
  const zipArgs = ['-r', archiveName, ...entries];

  await new Promise<void>((resolve, reject) => {
    const zipProc = spawn('zip', zipArgs, { cwd });

    zipProc.stderr.on('data', (data: Buffer) => {
      logger.warn?.('[export-items] zip stderr', data.toString());
    });

    zipProc.on('error', (zipError) => {
      logger.error?.('[export-items] Failed to spawn zip process', zipError);
      reject(zipError);
    });

    zipProc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      logger.error?.('[export-items] zip process exited with error code', { code });
      reject(new Error(`zip exited with code ${code}`));
    });
  });
}

export async function stageItemsExport(options: StageItemsExportOptions): Promise<ItemsExportArtifact> {
  const logger = options.logger ?? console;
  const mediaDir = options.mediaDir ?? MEDIA_DIR;
  const archiveBaseName = options.archiveBaseName || 'items-export';
  const exportMode = options.exportMode;

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${archiveBaseName}-`));
  const cleanup = async (): Promise<void> => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.error?.('[export-items] Failed to clean up export staging directory', { tempDir, cleanupError });
    }
  };

  try {
    let groupingActive = false;
    try {
      if (!EXPORT_MODES.has(exportMode)) {
        throw new Error(`Unsupported export mode: ${exportMode}`);
      }
      groupingActive = exportMode === 'erp';
    } catch (modeError) {
      logger.error?.('[export-items] Failed to resolve export grouping mode; defaulting to ungrouped export.', {
        exportMode,
        error: modeError
      });
      groupingActive = false;
    }

    let groupedRows = options.items;
    let mergedCount = 0;
    let clearedGroupedItemUUIDs = 0;
    if (groupingActive) {
      try {
        const groupingResult = groupExportRows(options.items, logger);
        groupedRows = groupingResult.groupedRows;
        mergedCount = groupingResult.mergedCount;
        clearedGroupedItemUUIDs = groupingResult.clearedGroupedItemUUIDs;
      } catch (groupingError) {
        logger.error?.('[export-items] Failed to group export rows; using raw rows instead.', groupingError);
        groupedRows = options.items;
      }
    }

    let exportColumns = columns;
    if (groupingActive) {
      exportColumns = columns.filter((column) => column !== 'itemUUID');
      try {
        logger.info?.('[export-items] Omitting ItemUUID column for grouped export output.', {
          mergedCount,
          clearedGroupedItemUUIDs,
          exportMode
        });
      } catch (logError) {
        logger.error?.('[export-items] Failed to log grouped export column adjustment.', logError);
      }
    }

    const { csv } = serializeItemsToCsv(groupedRows, exportColumns);
    const boxesCsv = serializeBoxes(options.boxes ?? []);
    const itemsPath = path.join(tempDir, 'items.csv');
    const boxesPath = path.join(tempDir, 'boxes.csv');
    await fs.promises.writeFile(itemsPath, csv, 'utf8');
    await fs.promises.writeFile(boxesPath, boxesCsv, 'utf8');

    if (!options.includeMedia) {
      return { archivePath: itemsPath, boxesPath, cleanup, itemsPath, kind: 'csv', tempDir };
    }

    let mediaLinked = false;
    const mediaLink = path.join(tempDir, 'media');
    try {
      if (fs.existsSync(mediaDir)) {
        await fs.promises.symlink(mediaDir, mediaLink, 'dir');
        mediaLinked = true;
      } else {
        logger.warn?.('[export-items] MEDIA_DIR missing during export; media folder omitted from archive.', {
          mediaDir
        });
      }
    } catch (mediaError) {
      logger.error?.('[export-items] Failed to link media directory into export archive staging area', mediaError);
    }

    const archiveName = `${archiveBaseName}.zip`;
    const zipEntries = [path.basename(itemsPath), path.basename(boxesPath)];
    if (mediaLinked) {
      zipEntries.push('media');
    }

    await createZipArchive({
      archiveName,
      cwd: tempDir,
      entries: zipEntries,
      logger
    });

    const archivePath = path.join(tempDir, archiveName);
    return { archivePath, boxesPath, cleanup, itemsPath, kind: 'zip', tempDir };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

const action = defineHttpAction({
  key: 'export-items',
  label: 'Export items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/export/items' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url || '', PUBLIC_ORIGIN);
      const actor = (url.searchParams.get('actor') || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      let exportMode: ExportMode;
      let modeSource: 'default' | 'explicit';
      try {
        ({ mode: exportMode, source: modeSource } = parseExportMode(url.searchParams.get('mode'), console));
      } catch (modeError) {
        console.error('[export-items] Invalid export mode provided.', {
          mode: url.searchParams.get('mode'),
          error: modeError
        });
        return sendJson(res, 400, { error: 'mode must be backup or erp' });
      }
      const groupingActive = exportMode === 'erp';
      try {
        console.info('[export-items] Export mode resolved.', {
          mode: exportMode,
          modeSource,
          groupingActive
        });
      } catch (logError) {
        console.error('[export-items] Failed to log export mode selection.', logError);
      }
      const createdAfter = url.searchParams.get('createdAfter');
      const updatedAfter = url.searchParams.get('updatedAfter');
      const items = ctx.listItemsForExport.all({
        createdAfter: createdAfter || null,
        updatedAfter: updatedAfter || null
      });
      const log = ctx.db.transaction((rows: any[], a: string) => {
        for (const row of rows) {
          ctx.logEvent({
            Actor: a,
            EntityType: 'Item',
            EntityId: row.ItemUUID,
            Event: 'Exported',
            Meta: JSON.stringify({ createdAfter, updatedAfter })
          });
        }
      });
      log(items, actor);
      const boxes = typeof ctx.listBoxes?.all === 'function' ? ctx.listBoxes.all() : [];
      const stagedExport = await stageItemsExport({
        archiveBaseName: `items-export-${Date.now()}`,
        boxes: Array.isArray(boxes) ? boxes : [],
        exportMode,
        includeMedia: true,
        items,
        logger: console,
        mediaDir: MEDIA_DIR
      });

      res.writeHead(200, {
        'Content-Type': stagedExport.kind === 'zip' ? 'application/zip' : 'text/csv',
        'Content-Disposition': `attachment; filename="${path.basename(stagedExport.archivePath)}"`
      });

      try {
        await pipeline(fs.createReadStream(stagedExport.archivePath), res);
      } finally {
        await stagedExport.cleanup();
      }
    } catch (err) {
      console.error('Export items failed', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: (err as Error).message });
      } else {
        try {
          res.destroy(err as Error);
        } catch (responseError) {
          console.error('[export-items] Failed to close response after error', responseError);
        }
      }
    }
  },
  view: () => '<div class="card"><p class="muted">Export items API</p></div>'
});

export default action;
