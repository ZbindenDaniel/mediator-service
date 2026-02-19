// TODO(agent): Verify Langtext helper logging during CSV ingestion before enforcing structured payloads.
// TODO(agent): Confirm agentic_runs.csv header expectations once import partner coverage is finalized.
// TODO(agent): Reconfirm ItemUUID prefix expectations with current CSV partner guidance.
// TODO(agent): Keep importer box persistence in sync with schema changes (PhotoPath, future metadata).
// TODO(agent): Monitor Grafikname multi-image normalization so downstream exporters can drop legacy fallbacks.
// TODO(agent): Evaluate ZIP-sourced merge rules for boxes and media once parallel uploads are supported by partners.
// TODO(agent): Align CSV alias handling for ItemUUID and quantity headers with export columns.
// TODO(agent): Revisit legacy schema detection logging once CSV partner inventory coverage expands.
// TODO(agent): Recheck legacy quantity normalization rules once more category-based guidance is available.
// TODO(agent): Capture legacy column mapping metrics alongside ingest summaries once schema mapping stabilizes.
// TODO(agent): Capture events.csv import telemetry once event ingestion volumes are known.
// TODO(suchbegriff-import): Confirm Suchbegriff fallback normalization aligns with search-term defaults.
// TODO(agent): Confirm Artikel_Nummer normalization rules (e.g., hyphen handling) with CSV partners.
// TODO(agent): Revisit agentic_runs parent-reference lookup batching if import volumes make per-row checks too expensive.
import fs from 'fs';
import path from 'path';
import { parse as parseCsvStream } from 'csv-parse';
import { parse as parseCsvSync } from 'csv-parse/sync';
import {
  runUpsertBox,
  persistItem,
  queueLabel,
  persistItemReference,
  upsertAgenticRun,
  findByMaterial,
  getMaxArtikelNummer,
  insertEventLogEntry,
  hasItemReferenceByArtikelNummer
} from './db';
import { IMPORTER_FORCE_ZERO_STOCK } from './config';
import { Box, Item, ItemEinheit, normalizeEventLogLevel, normalizeItemEinheit } from '../models';
import { normalizeQuality, resolveQualityFromLabel } from '../models/quality';
import { Op } from './ops/types';
import { resolveStandortLabel, normalizeStandortCode } from './standort-label';
import { formatItemIdDateSegment } from './lib/itemIds';
import { parseLangtext } from './lib/langtext';
import { resolveCategoryLabelToCode, CategoryFieldType } from './lib/categoryLabelLookup';

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

// TODO(agent): Seed Artikelnummer-based ItemUUID sequences from the database for high-concurrency imports.
const ITEM_ID_PREFIX = 'I-';
const ID_SEQUENCE_WIDTH = 4;
const ARTIKEL_NUMMER_WIDTH = 5;

// TODO(agent): Revisit shelf BoxID validation if location normalization rules evolve.
// TODO(agent): Expand quantity field resolution when additional column spellings surface.
const QUANTITY_FIELD_PRIORITIES = [
  { field: 'Auf_Lager', warnOnUse: false },
  { field: 'Qty', warnOnUse: false },
  { field: 'onhand', warnOnUse: true },
  { field: 'Onhand', warnOnUse: true },
  { field: 'OnHand', warnOnUse: true },
] as const;

// TODO(agent): Refresh identifier date fallbacks whenever upstream exports introduce new timestamp columns.
// TODO(agent): Track insertdateset adoption to keep importer fallback priorities minimal but complete.
// TODO(agent): Collapse entrydate alias coverage once upstream exporters stabilize on a canonical Datum_erfasst header.
type ImportDateFieldDescriptor = {
  field: string;
  priority: number;
  isAlias?: boolean;
};

const IMPORT_DATE_FIELD_PRIORITY_DESCRIPTORS: readonly ImportDateFieldDescriptor[] = Object.freeze([
  { field: 'idate', priority: 10 },
  { field: 'Datum erfasst', priority: 20 },
  { field: 'CreatedAt', priority: 25, isAlias: true },
  { field: 'Datum_erfasst', priority: 30 },
  { field: 'entrydate', priority: 40, isAlias: true },
  { field: 'entry_date', priority: 50, isAlias: true },
  { field: 'EntryDate', priority: 60, isAlias: true },
  { field: 'itime', priority: 70 },
  { field: 'mtime', priority: 80 },
  { field: 'insertdate', priority: 90 },
  { field: 'insertdateset', priority: 100 },
]);

const SORTED_IMPORT_DATE_FIELD_DESCRIPTORS = Object.freeze(
  [...IMPORT_DATE_FIELD_PRIORITY_DESCRIPTORS].sort((a, b) => a.priority - b.priority)
);

export const IMPORT_DATE_FIELD_PRIORITIES = SORTED_IMPORT_DATE_FIELD_DESCRIPTORS.map(
  (descriptor) => descriptor.field
) as readonly string[];

const IMPORT_DATE_ALIAS_FIELDS = new Set(
  SORTED_IMPORT_DATE_FIELD_DESCRIPTORS.filter((descriptor) => descriptor.isAlias).map(
    (descriptor) => descriptor.field
  )
);

// TODO(agent): Keep partner alias coverage synchronized with downstream CSV specs to minimize importer drift.
type PartnerFieldAlias = {
  source: string;
  target: string;
};

const PARTNER_FIELD_ALIASES: readonly PartnerFieldAlias[] = Object.freeze([
  { source: 'partnumber', target: 'Artikel-Nummer' },
  { source: 'image_names', target: 'Grafikname(n)' },
  { source: 'description', target: 'Artikelbeschreibung' },
  { source: 'suchbegriff', target: 'Suchbegriff' },
  { source: 'notes', target: 'Kurzbeschreibung' },
  { source: 'longdescription', target: 'Langtext' },
  { source: 'manufacturer', target: 'Hersteller' },
  { source: 'type_and_classific', target: 'Artikeltyp' },
  { source: 'entrydate', target: 'Datum erfasst' },
  { source: 'length_mm', target: 'Länge(mm)' },
  { source: 'width_mm', target: 'Breite(mm)' },
  { source: 'height_mm', target: 'Höhe(mm)' },
  { source: 'weight_kg', target: 'Gewicht(kg)' },
  { source: 'sellprice', target: 'Verkaufspreis' },
  { source: 'published_status', target: 'Veröffentlicht_Status' },
  { source: 'shoparticle', target: 'Shopartikel' },
  { source: 'unit', target: 'Einheit' },
  { source: 'cvar_categories_A1', target: 'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)' },
  { source: 'cvar_categories_A2', target: 'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)' },
  { source: 'cvar_categories_B1', target: 'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)' },
  { source: 'cvar_categories_B2', target: 'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)' },
  { source: 'ItemUUID', target: 'itemUUID' },
  { source: 'Auf Lager', target: 'Auf_Lager' },
]);

const LEGACY_SCHEMA_HEADERS = new Set([
  'Produkt-Nr.',
  'Menge',
  'Artikel-Bezeichnung',
  'Beschreibung aus Kurz-Produktbeschreibung',
  'Behältnis-Nr.',
  'Lager-Behältnis',
  'Lagerraum'
]);

const LEGACY_SCHEMA_VERSION_HEADERS = new Set(['schemaVersion', 'SchemaVersion', 'exportVersion', 'ExportVersion']);
const LEGACY_BULK_CATEGORY_PREFIXES = Object.freeze([110]);

const KNOWN_ITEM_COLUMNS = new Set<string>([
  'Artikel-Nummer',
  'Artikelbeschreibung',
  'Suchbegriff',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Artikeltyp',
  'Einheit',
  'Auf_Lager',
  'Qty',
  'onhand',
  'Onhand',
  'OnHand',
  'Grafikname(n)',
  'Grafikname',
  'ImageNames',
  'BoxID',
  'LocationId',
  'Standort',
  'Location',
  'Label',
  'CreatedAt',
  'Notes',
  'PhotoPath',
  'PlacedBy',
  'PlacedAt',
  'UpdatedAt',
  'Datum erfasst',
  'Datum_erfasst',
  'EntryDate',
  'entrydate',
  'entry_date',
  'idate',
  'itime',
  'mtime',
  'insertdate',
  'insertdateset',
  'Länge(mm)',
  'Breite(mm)',
  'Höhe(mm)',
  'Gewicht(kg)',
  'Verkaufspreis',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'itemUUID',
  'partnumber',
  'image_names',
  'description',
  'suchbegriff',
  'notes',
  'longdescription',
  'manufacturer',
  'type_and_classific',
  'length_mm',
  'width_mm',
  'height_mm',
  'weight_kg',
  'sellprice',
  'published_status',
  'shoparticle',
  'unit',
  'cvar_categories_A1',
  'cvar_categories_A2',
  'cvar_categories_B1',
  'cvar_categories_B2',
  'ItemUUID',
  'Auf Lager',
  'Produkt-Nr.',
  'Menge',
  'Artikel-Bezeichnung',
  'Beschreibung aus Kurz-Produktbeschreibung',
  'Behältnis-Nr.',
  'Lager-Behältnis',
  'Lagerraum',
  'id',
  'weight',
  'image',
  'shop',
  'bin_id',
  'schemaVersion',
  'SchemaVersion',
  'exportVersion',
  'ExportVersion',
]);

const EVENT_REQUIRED_FIELDS = ['CreatedAt', 'EntityType', 'EntityId', 'Event', 'Level'] as const;

function hydratePartnerFieldAliases(row: Record<string, string>, rowNumber: number): void {
  for (const alias of PARTNER_FIELD_ALIASES) {
    try {
      if (!Object.prototype.hasOwnProperty.call(row, alias.source)) {
        continue;
      }
      const rawSourceValue = row[alias.source];
      if (rawSourceValue === undefined || rawSourceValue === null) {
        continue;
      }
      const currentTargetValue = row[alias.target];
      const normalizedTargetValue =
        typeof currentTargetValue === 'string'
          ? currentTargetValue.trim()
          : currentTargetValue === undefined || currentTargetValue === null
            ? ''
            : String(currentTargetValue).trim();
      if (normalizedTargetValue) {
        continue;
      }
      const normalizedSourceValue =
        typeof rawSourceValue === 'string' ? rawSourceValue : String(rawSourceValue);
      row[alias.target] = normalizedSourceValue;
      console.debug('[importer] Hydrated legacy column via partner alias', {
        rowNumber,
        aliasSource: alias.source,
        aliasTarget: alias.target,
      });
    } catch (aliasError) {
      console.debug('[importer] Skipped partner alias application due to unexpected value', {
        rowNumber,
        aliasSource: alias.source,
        aliasTarget: alias.target,
        error: aliasError,
      });
    }
  }
}

interface QuantityFieldResolution {
  value: string | undefined;
  source: (typeof QUANTITY_FIELD_PRIORITIES)[number]['field'] | null;
}

function resolveQuantityFieldValue(
  row: Record<string, string>,
  rowNumber: number,
  options: { logFallback?: boolean } = {}
): QuantityFieldResolution {
  const { logFallback = true } = options;
  try {
    for (const candidate of QUANTITY_FIELD_PRIORITIES) {
      if (!Object.prototype.hasOwnProperty.call(row, candidate.field)) {
        continue;
      }
      const rawValue = row[candidate.field];
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
      if (!trimmed) {
        continue;
      }
      if (candidate.warnOnUse && logFallback) {
        try {
          console.warn('[importer] Falling back to onhand quantity column for CSV row', {
            rowNumber,
            field: candidate.field,
          });
        } catch (loggingError) {
          console.error('[importer] Failed to log onhand quantity fallback', {
            rowNumber,
            field: candidate.field,
            loggingError,
          });
        }
      }
      return { value: trimmed, source: candidate.field };
    }
  } catch (error) {
    console.error('[importer] Failed to resolve quantity column for row', { rowNumber, error });
  }
  return { value: undefined, source: null };
}

export function detectLegacySchema(headers: string[]): {
  detected: boolean;
  matches: string[];
  versionFlag: string | null;
} {
  try {
    const matches = headers.filter((header) => LEGACY_SCHEMA_HEADERS.has(header));
    const versionFlag = headers.find((header) => LEGACY_SCHEMA_VERSION_HEADERS.has(header)) ?? null;
    return { detected: matches.length > 0 || Boolean(versionFlag), matches, versionFlag };
  } catch (error) {
    console.error('[importer] Failed to detect legacy schema headers', { error });
    return { detected: false, matches: [], versionFlag: null };
  }
}

export function logUnknownColumns(headers: string[]): void {
  if (!headers.length) {
    return;
  }
  try {
    const unknownColumns = headers.filter((header) => !KNOWN_ITEM_COLUMNS.has(header));
    if (unknownColumns.length > 0) {
      console.warn('[importer] Detected unknown CSV columns', { unknownColumns });
    }
  } catch (error) {
    console.error('[importer] Failed to log unknown CSV columns', { error });
  }
}

// TODO(agent): Consolidate Langtext CSV sanitization with downstream formatting helpers once exporters provide valid JSON.
function sanitizeLangtextCsvValue(
  value: unknown,
  context: { rowNumber: number; artikelNummer: string | null; itemUUID: string | null }
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  let normalized = '';
  try {
    normalized = typeof value === 'string' ? value : String(value);
  } catch (coercionError) {
    try {
      console.warn('[importer] Skipping Langtext value due to coercion failure', {
        ...context,
        coercionError,
      });
    } catch (loggingError) {
      console.error('[importer] Failed to log Langtext coercion failure', { ...context, loggingError });
    }
    return null;
  }

  const trimmed = normalized.trim();
  if (!trimmed) {
    return '';
  }

  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch (parseError) {
    let escaped = trimmed.replace(/(^|[^\\])"/g, '$1\\"');
    if (escaped.startsWith('{')) {
      escaped = `\\${escaped}`;
    }
    try {
      console.warn('[importer] Sanitized malformed Langtext JSON; persisting as plain text', {
        ...context,
        parseError,
      });
    } catch (loggingError) {
      console.error('[importer] Failed to log Langtext JSON sanitization', { ...context, loggingError });
    }
    return escaped;
  }
}

function resolveCsvEinheit(value: unknown, rowNumber: number): ItemEinheit {
  let candidate = '';
  if (typeof value === 'string') {
    candidate = value.trim();
  } else if (value != null) {
    candidate = String(value).trim();
  }
  try {
    const normalized = normalizeItemEinheit(candidate);
    if (normalized) {
      return normalized;
    }
  } catch (error) {
    console.error('[importer] Failed to verify Einheit from CSV row, defaulting to Stk', {
      rowNumber,
      provided: value,
      error
    });
    return DEFAULT_EINHEIT;
  }
  console.warn('[importer] Falling back to default Einheit for CSV row', {
    rowNumber,
    provided: value,
    normalized: candidate,
    defaultValue: DEFAULT_EINHEIT
  });
  return DEFAULT_EINHEIT;
}

function resolveInstancePlan(
  aufLager: number,
  einheit: ItemEinheit,
  context: {
    rowNumber: number;
    artikelNummer: string;
    legacySchemaDetected: boolean;
    hasExplicitEinheit: boolean;
    categoryCodes: number[];
  }
): { instanceCount: number; quantityPerItem: number } {
  try {
    if (!Number.isFinite(aufLager) || aufLager <= 0) {
      return { instanceCount: 0, quantityPerItem: 0 };
    }
    const bulkCategoryHit = context.categoryCodes.some((code) => {
      if (!Number.isFinite(code)) {
        return false;
      }
      return LEGACY_BULK_CATEGORY_PREFIXES.some((prefix) =>
        code === prefix || (code >= prefix * 10 && code < (prefix + 1) * 10)
      );
    });
    const shouldUseBulkQuantity =
      einheit === ItemEinheit.Menge || (context.legacySchemaDetected && !context.hasExplicitEinheit && bulkCategoryHit);

    if (!shouldUseBulkQuantity) {
      return { instanceCount: Math.max(1, Math.trunc(aufLager)), quantityPerItem: 1 };
    }
    if (bulkCategoryHit && context.legacySchemaDetected && !context.hasExplicitEinheit) {
      try {
        console.info('[importer] Applied legacy category bulk quantity rule', {
          ...context,
          aufLager,
          einheit,
        });
      } catch (loggingError) {
        console.error('[importer] Failed to log legacy category bulk quantity rule', {
          ...context,
          loggingError,
        });
      }
    }
    return { instanceCount: 1, quantityPerItem: Math.trunc(aufLager) };
  } catch (error) {
    console.error('[importer] Failed to normalize legacy quantity values', {
      ...context,
      aufLager,
      einheit,
      error,
    });
    return { instanceCount: 0, quantityPerItem: 0 };
  }
}

export function parseImageNames(
  value: unknown,
  options: { rowNumber?: number; fieldName?: string } = {}
): string[] {
  const { rowNumber, fieldName = 'Grafikname(n)' } = options;
  if (value === undefined || value === null) {
    return [];
  }
  try {
    const raw = typeof value === 'string' ? value : String(value);
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const part of trimmed.split('|')) {
      const entry = part.trim();
      if (!entry || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      normalized.push(entry);
    }
    return normalized;
  } catch (error) {
    try {
      console.warn('[importer] Failed to parse Grafikname(n) image list; defaulting to empty array', {
        rowNumber,
        fieldName,
        error
      });
    } catch (loggingError) {
      console.error('[importer] Failed to log Grafikname(n) parsing error', {
        rowNumber,
        fieldName,
        loggingError
      });
    }
    return [];
  }
}

function resolveSuchbegriffValue(
  rawValue: unknown,
  artikelbeschreibung: string,
  context: { rowNumber: number; artikelNummer: string | null; itemUUID: string | null }
): string {
  try {
    const normalized = typeof rawValue === 'string' ? rawValue.trim() : '';
    const fallback = typeof artikelbeschreibung === 'string' ? artikelbeschreibung.trim() : '';
    if (!normalized && fallback) {
      console.info('[importer] Defaulted Suchbegriff to Artikelbeschreibung for CSV row', {
        rowNumber: context.rowNumber,
        artikelNummer: context.artikelNummer,
        itemUUID: context.itemUUID,
      });
    }
    return normalized || fallback;
  } catch (error) {
    console.error('[importer] Failed to normalize Suchbegriff for CSV row; falling back to Artikelbeschreibung', {
      rowNumber: context.rowNumber,
      artikelNummer: context.artikelNummer,
      itemUUID: context.itemUUID,
      error,
    });
    return typeof artikelbeschreibung === 'string' ? artikelbeschreibung : '';
  }
}

// TODO: Extend parsing to cover additional partner provided formats once discovered.

interface NumericParseOptions {
  defaultValue?: number;
  treatBlankAsUndefined?: boolean;
  categoryType?: CategoryFieldType;
}

function determineFallbackValue(
  options: NumericParseOptions,
  treatBlankAsUndefined: boolean
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(options, 'defaultValue')) {
    return options.defaultValue;
  }
  return treatBlankAsUndefined ? undefined : 0;
}

function normalizeNumericValue(rawValue: string, allowDecimal: boolean): string | null {
  const compacted = rawValue.replace(/\s+/g, '');
  if (!compacted) {
    return null;
  }

  let sign = '';
  let unsigned = compacted;
  if (unsigned.startsWith('+')) {
    unsigned = unsigned.slice(1);
  }
  if (unsigned.startsWith('-')) {
    sign = '-';
    unsigned = unsigned.slice(1);
  }

  if (!unsigned) {
    return null;
  }

  unsigned = unsigned.replace(/["'`´]/g, '');

  const invalidFragments = unsigned.replace(/[0-9.,]/g, '');
  if (invalidFragments.length > 0) {
    return null;
  }

  if (allowDecimal) {
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);

    if (decimalIndex >= 0) {
      const integerPartRaw = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '');
      const fractionalPartRaw = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');

      if (!integerPartRaw && !fractionalPartRaw) {
        return null;
      }

      if (fractionalPartRaw) {
        return `${sign}${integerPartRaw || '0'}.${fractionalPartRaw}`;
      }

      return `${sign}${integerPartRaw || '0'}`;
    }
  }

  const digitsOnly = unsigned.replace(/[.,]/g, '');
  if (!digitsOnly) {
    return null;
  }

  return `${sign}${digitsOnly}`;
}

function parseIntegerField(
  rawValue: string | null | undefined,
  fieldName: string,
  options: NumericParseOptions = {}
): number | undefined {
  const { treatBlankAsUndefined = false } = options;
  const fallback = determineFallbackValue(options, treatBlankAsUndefined);

  if (rawValue === null || rawValue === undefined) {
    console.warn('CSV ingestion: integer field is null or undefined', { field: fieldName });
    return fallback;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    console.warn('CSV ingestion: integer field is blank', { field: fieldName });
    return fallback;
  }

  try {
    if (options.categoryType) {
      const resolved = resolveCategoryLabelToCode(trimmed, options.categoryType);
      if (typeof resolved === 'number') {
        return resolved;
      }
    }

    const normalized = normalizeNumericValue(trimmed, false);
    if (normalized === null) {
      console.warn('CSV ingestion: failed to normalize integer field', { field: fieldName, value: trimmed });
    }

    const target = normalized ?? trimmed;
    const parsed = Number.parseInt(target, 10);

    if (Number.isNaN(parsed)) {
      console.warn('CSV ingestion: integer parse produced NaN', { field: fieldName, value: trimmed, normalized });
      if (options.categoryType) {
        console.warn('CSV ingestion: category label could not be mapped to code', {
          field: fieldName,
          value: trimmed
        });
      }
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.error('CSV ingestion: unexpected error while parsing integer field', {
      field: fieldName,
      value: rawValue,
      error,
    });
    return fallback;
  }
}

function parseDecimalField(
  rawValue: string | null | undefined,
  fieldName: string,
  options: NumericParseOptions = {}
): number | undefined {
  const { treatBlankAsUndefined = false } = options;
  const fallback = determineFallbackValue(options, treatBlankAsUndefined);

  if (rawValue === null || rawValue === undefined) {
    return fallback;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const normalized = normalizeNumericValue(trimmed, true);
    if (normalized === null) {
      console.warn('CSV ingestion: failed to normalize decimal field', { field: fieldName, value: trimmed });
    }

    const target = normalized ?? trimmed.replace(/,/g, '.');
    const parsed = Number.parseFloat(target);

    if (Number.isNaN(parsed)) {
      console.warn('CSV ingestion: decimal parse produced NaN', { field: fieldName, value: trimmed, normalized });
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.error('CSV ingestion: unexpected error while parsing decimal field', {
      field: fieldName,
      value: rawValue,
      error,
    });
    return fallback;
  }
}

function resolveImportDate(
  row: Record<string, string>,
  fallback: Date,
  rowNumber: number
): Date {
  const dateSource = row as Record<string, string | undefined>;
  for (const key of IMPORT_DATE_FIELD_PRIORITIES) {
    const raw = dateSource[key];
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = parseDatumErfasst(trimmed);
      if (parsed) {
        if (IMPORT_DATE_ALIAS_FIELDS.has(key)) {
          try {
            console.info('[importer] Using identifier date alias column', {
              rowNumber,
              aliasField: key,
            });
          } catch (loggingError) {
            console.error('[importer] Failed to log identifier date alias usage', {
              rowNumber,
              aliasField: key,
              loggingError,
            });
          }
        }
        return parsed;
      }
    } catch (error) {
      console.error('[importer] Failed to parse identifier date candidate', {
        rowNumber,
        field: key,
        value: raw,
        error,
      });
    }
  }
  console.warn('[importer] Falling back to ingestion timestamp for identifier date segment', { rowNumber });
  return fallback;
}

function mintSequentialIdentifier(
  prefix: string,
  date: Date,
  sequences: Map<string, number>
): string {
  const segment = formatItemIdDateSegment(date);
  const previous = sequences.get(segment) ?? 0;
  const next = previous + 1;
  sequences.set(segment, next);
  const sequenceSegment = String(next).padStart(ID_SEQUENCE_WIDTH, '0');
  return `${prefix}${segment}-${sequenceSegment}`;
}

function mintArtikelItemIdentifier(
  prefix: string,
  artikelNummer: string,
  sequences: Map<string, number>
): string {
  const normalizedArtikelNummer = artikelNummer.trim();
  if (!normalizedArtikelNummer) {
    throw new Error('Missing Artikel_Nummer for ItemUUID minting');
  }
  if (normalizedArtikelNummer.includes('-')) {
    throw new Error('Invalid Artikel_Nummer for ItemUUID minting');
  }
  const previous = sequences.get(normalizedArtikelNummer) ?? 0;
  const next = previous + 1;
  sequences.set(normalizedArtikelNummer, next);
  const sequenceSegment = String(next).padStart(ID_SEQUENCE_WIDTH, '0');
  return `${prefix}${normalizedArtikelNummer}-${sequenceSegment}`;
}

type ArtikelNummerNormalizationStatus = 'ok' | 'missing' | 'invalid';

type ArtikelNummerNormalizationResult = {
  value: string;
  mintableValue: string | null;
  status: ArtikelNummerNormalizationStatus;
};

function normalizeArtikelNummerValue(rawValue: unknown, rowNumber: number): ArtikelNummerNormalizationResult {
  const rawText =
    rawValue === undefined || rawValue === null ? '' : typeof rawValue === 'string' ? rawValue : String(rawValue);
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { value: '', mintableValue: null, status: 'missing' };
  }
  const compacted = trimmed.replace(/\s+/g, '');
  if (compacted !== trimmed) {
    console.info('[importer] Normalized whitespace in Artikel_Nummer', {
      rowNumber,
      original: trimmed,
      normalized: compacted,
    });
  }
  if (compacted.includes('-')) {
    console.warn('[importer] Invalid Artikel_Nummer format detected in CSV row', {
      rowNumber,
      artikelNummer: compacted,
    });
    return { value: compacted, mintableValue: null, status: 'invalid' };
  }
  return { value: compacted, mintableValue: compacted, status: 'ok' };
}

// TODO(agent): Replace sequential Artikel_Nummer minting with DB-backed counters when ingestion concurrency grows.
type ArtikelNummerMintState = {
  baseValue: number;
  mintedCount: number;
};

function resolveArtikelNummerMintState(): ArtikelNummerMintState {
  let baseValue = 0;
  try {
    const row = getMaxArtikelNummer.get() as { Artikel_Nummer?: string | null } | undefined;
    if (row && typeof row.Artikel_Nummer === 'string') {
      const normalized = row.Artikel_Nummer.trim();
      if (normalized) {
        const parsed = Number.parseInt(normalized, 10);
        if (!Number.isNaN(parsed)) {
          baseValue = parsed;
        } else {
          console.warn('[importer] Ignoring non-numeric max Artikel_Nummer value', {
            provided: row.Artikel_Nummer,
          });
        }
      }
    }
  } catch (error) {
    console.error('[importer] Failed to inspect max Artikel_Nummer before CSV ingestion', { error });
  }
  if (baseValue > 0) {
    console.log('[importer] Initializing Artikel_Nummer mint state from database value', {
      baseValue,
    });
  }
  return { baseValue, mintedCount: 0 };
}

function mintArtikelNummerFromState(state: ArtikelNummerMintState): string {
  state.mintedCount += 1;
  const nextValue = state.baseValue + state.mintedCount;
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    throw new Error('Invalid Artikel_Nummer mint state detected');
  }
  return String(nextValue).padStart(ARTIKEL_NUMMER_WIDTH, '0');
}

function parseDatumErfasst(rawValue: string | null | undefined): Date | undefined {
  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const isoCandidate = new Date(trimmed);
    if (!Number.isNaN(isoCandidate.getTime())) {
      return isoCandidate;
    }

    const localizedMatch = trimmed.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (localizedMatch) {
      const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = localizedMatch;
      const day = Number.parseInt(dayStr, 10);
      const month = Number.parseInt(monthStr, 10);
      const year = Number.parseInt(yearStr, 10);
      const hour = hourStr ? Number.parseInt(hourStr, 10) : 0;
      const minute = minuteStr ? Number.parseInt(minuteStr, 10) : 0;
      const second = secondStr ? Number.parseInt(secondStr, 10) : 0;

      const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

      if (!Number.isNaN(normalized.getTime())) {
        return normalized;
      }
    }

    console.warn('CSV ingestion: failed to normalize Datum erfasst value', { value: trimmed });
    return undefined;
  } catch (error) {
    console.error('CSV ingestion: unexpected error while parsing Datum erfasst', {
      value: rawValue,
      error,
    });
    return undefined;
  }
}

function loadOps(): Op[] {
  try {
    const dir = path.join(__dirname, 'ops');
    const entries = fs.readdirSync(dir);
    const files = entries
      .filter((f) => /\d+-.*\.(ts|js)$/.test(f))
      .sort();

    const seen = new Set<string>();
    const modules: Op[] = [];
    for (const f of files) {
      const base = f.replace(/\.(ts|js)$/, '');
      if (seen.has(base)) continue;
      seen.add(base);
      try {
        const mod = require(path.join(dir, f));
        const op = (mod.default || mod) as Partial<Op>;
        if (op && typeof op.apply === 'function') {
          modules.push(op as Op);
        }
      } catch (err) {
        console.error('Failed to load op', f, err);
      }
    }
    return modules;
  } catch (err) {
    console.error('Failed to load ops', err);
    return [];
  }
}

const ops = loadOps();

export interface IngestCsvFileOptions {
  zeroStock?: boolean;
}

function applyOps(row: Record<string, string>, runState: Map<string, unknown>): Record<string, string> {
  const ctx = {
    queueLabel: (itemUUID: string) => queueLabel.run(itemUUID),
    log: (...a: unknown[]) => console.log('[ops]', ...a),
    runState,
  };
  let current = row;
  for (const op of ops) {
    try {
      const res = op.apply({ ...current }, ctx);
      if (!res || res.ok === false) {
        const errs = res && res.errors ? res.errors.join('; ') : 'unknown';
        throw new Error(`Op ${op.name} failed: ${errs}`);
      }
      current = res.row || current;
    } catch (err) {
      console.error(`Operation ${op.name} threw`, err);
      throw err;
    }
  }
  return current;
}

export async function ingestCsvFile(
  absPath: string,
  options: IngestCsvFileOptions = {}
): Promise<{ count: number; boxes: string[] }> {
  console.log(`Ingesting CSV file: ${absPath}`);
  try {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const records = await readCsv(absPath);
    const headerKeys = records.length > 0 ? Object.keys(records[0]) : [];
    logUnknownColumns(headerKeys);
    const legacySchema = detectLegacySchema(headerKeys);
    if (legacySchema.detected) {
      console.info('[importer] Detected legacy CSV schema headers', {
        matchedHeaders: legacySchema.matches,
        versionFlag: legacySchema.versionFlag,
      });
    }
    const zeroStockRequested = options.zeroStock ?? IMPORTER_FORCE_ZERO_STOCK;
    let count = 0;
    const boxesTouched = new Set<string>();
    const itemSequenceByArtikelNummer = new Map<string, number>();
    const itemSequenceByDate = new Map<string, number>();
    const runState = new Map<string, unknown>();
    const artikelNummerMintState = resolveArtikelNummerMintState();

    for (const [index, r] of records.entries()) {
      const rowNumber = index + 1;
      const row = normalize(r);
      if (Object.values(row).every((value) => !value)) {
        console.info('[importer] Skipping empty CSV row', { rowNumber });
        continue;
      }

      let final: Record<string, string>;
      try {
        final = applyOps(row, runState);
      } catch (opError) {
        console.error('[importer] Skipping CSV row due to legacy mapping failure', {
          rowNumber,
          error: opError,
        });
        continue;
      }
      hydratePartnerFieldAliases(final, rowNumber);
      const imageNameEntries = parseImageNames(final['Grafikname(n)'], { rowNumber });
      const serializedImageNames = imageNameEntries.length > 0 ? imageNameEntries.join('|') : null;
      const grafiknameFromRow = typeof final['Grafikname(n)'] === 'string' ? final['Grafikname(n)'].trim() : '';
      const grafiknameCanonical = imageNameEntries[0] ?? grafiknameFromRow;
      if (!grafiknameCanonical && serializedImageNames) {
        try {
          console.warn('[importer] Dropped additional image_name entries due to blank Grafikname column', {
            rowNumber,
            entryCount: imageNameEntries.length,
          });
        } catch (loggingError) {
          console.error('[importer] Failed to log Grafikname blank warning for image list', {
            rowNumber,
            loggingError,
          });
        }
      }
      // TODO(agent): Remove Datum erfasst alias hydration once upstream CSVs always emit normalized timestamps.
      const datumErfasstRaw = final['Datum erfasst'];
      const datumErfasstMissing = typeof datumErfasstRaw !== 'string' || datumErfasstRaw.trim() === '';
      if (datumErfasstMissing) {
        try {
          let fallbackAlias: string | null = null;
          let fallbackValue: string | null = null;
          for (const field of IMPORT_DATE_FIELD_PRIORITIES) {
            if (field === 'Datum erfasst') {
              continue;
            }
            const candidateValue = final[field];
            if (candidateValue === undefined || candidateValue === null) {
              continue;
            }
            if (typeof candidateValue !== 'string') {
              console.warn('[importer] Skipping Datum erfasst alias with non-string value', {
                rowNumber,
                aliasField: field,
              });
              continue;
            }
            const trimmedCandidate = candidateValue.trim();
            if (!trimmedCandidate) {
              console.warn('[importer] Skipping Datum erfasst alias with blank value', {
                rowNumber,
                aliasField: field,
              });
              continue;
            }
            fallbackAlias = field;
            fallbackValue = trimmedCandidate;
            break;
          }
          if (fallbackAlias && fallbackValue) {
            final['Datum erfasst'] = fallbackValue;
            console.log('[importer] Defaulted Datum erfasst from alias column', {
              rowNumber,
              aliasField: fallbackAlias,
            });
          }
        } catch (datumErfasstAliasError) {
          console.error('[importer] Failed to hydrate Datum erfasst from alias', {
            rowNumber,
            error: datumErfasstAliasError,
          });
        }
      }
      if (zeroStockRequested) {
        const resolvedQuantity = resolveQuantityFieldValue(final, rowNumber, { logFallback: false });
        const originalQuantity = resolvedQuantity.value ?? '';
        final['Auf_Lager'] = '0';
        final['Qty'] = '0';
        if (originalQuantity !== '0') {
          console.info('[importer] Overriding quantity to zero for CSV row', {
            rowNumber,
            artikelNummer: typeof final['Artikel-Nummer'] === 'string' ? final['Artikel-Nummer'].trim() : null,
          });
        }
      }
      const identifierDate = resolveImportDate(final, nowDate, rowNumber);
      const rawStandort = final.LocationId || final.Standort || final.Location || '';
      const normalizedStandort = normalizeStandortCode(rawStandort);
      const locationId = normalizedStandort || null;
      const explicitLabel = typeof final.Label === 'string' ? final.Label.trim() : '';
      const standortLabel = explicitLabel || resolveStandortLabel(normalizedStandort);
      if (normalizedStandort && !standortLabel && !explicitLabel) {
        console.warn('CSV ingestion: missing Standort label mapping', { standort: normalizedStandort });
      }
      let normalizedBoxId: string | null = null;
      const providedBoxId = typeof final.BoxID === 'string' ? final.BoxID.trim() : '';
      if (providedBoxId) {
        try {
          const hasShelfPrefix = providedBoxId.startsWith('S-');
          const isValidBoxId = hasShelfPrefix
            ? isValidShelfBoxId(providedBoxId, { rowNumber })
            : isValidNonShelfBoxId(providedBoxId, { rowNumber });
          if (!isValidBoxId) {
            console.warn('[importer] Skipping CSV row due to invalid provided BoxID', {
              rowNumber,
              providedBoxId,
              reason: hasShelfPrefix ? 'invalid-shelf-box-id-format' : 'invalid-box-id-format',
            });
            continue;
          }
          normalizedBoxId = providedBoxId;
          final.BoxID = providedBoxId;
          console.info('[importer] Preserving provided BoxID for CSV row', {
            rowNumber,
            providedBoxId,
            reason: hasShelfPrefix ? 'valid-shelf-box-id' : 'valid-box-id',
          });
        } catch (validationError) {
          console.error('[importer] Skipping CSV row after BoxID validation error', {
            rowNumber,
            providedBoxId,
            reason: 'box-id-validation-error',
            error: validationError,
          });
          continue;
        }
      } else {
        final.BoxID = '';
      }
      if (normalizedBoxId) {
        const createdAt = typeof final.CreatedAt === 'string' && final.CreatedAt.trim() ? final.CreatedAt.trim() : null;
        const notes = typeof final.Notes === 'string' && final.Notes.trim() ? final.Notes.trim() : null;
        const photoPath = typeof final.PhotoPath === 'string' && final.PhotoPath.trim() ? final.PhotoPath.trim() : null;
        const placedBy = typeof final.PlacedBy === 'string' && final.PlacedBy.trim() ? final.PlacedBy.trim() : null;
        const placedAt = typeof final.PlacedAt === 'string' && final.PlacedAt.trim() ? final.PlacedAt.trim() : null;
        const box: Box = {
          BoxID: normalizedBoxId,
          LocationId: locationId,
          Label: standortLabel || null,
          CreatedAt: createdAt,
          Notes: notes,
          PhotoPath: photoPath,
          PlacedBy: placedBy,
          PlacedAt: placedAt,
          UpdatedAt: now,
        };
        runUpsertBox(box);
      }
      const rawArtikelNummer = final['Artikel-Nummer'];
      const artikelNummerNormalization = normalizeArtikelNummerValue(rawArtikelNummer, rowNumber);
      let artikelNummer = artikelNummerNormalization.value;
      let artikelNummerForMinting = artikelNummerNormalization.mintableValue;
      let artikelNummerStatus = artikelNummerNormalization.status;
      if (!artikelNummer) {
        try {
          artikelNummer = mintArtikelNummerFromState(artikelNummerMintState);
          artikelNummerForMinting = artikelNummer;
          artikelNummerStatus = 'ok';
          final['Artikel-Nummer'] = artikelNummer;
          console.log('[importer] Minted Artikel_Nummer for CSV row', {
            rowNumber,
            mintedArtikelNummer: artikelNummer,
          });
        } catch (mintError) {
          console.error('[importer] Failed to mint Artikel_Nummer for CSV row', {
            rowNumber,
            mintError,
          });
          continue;
        }
      } else {
        final['Artikel-Nummer'] = artikelNummer;
      }
      const grafikname = grafiknameCanonical;
      const artikelbeschreibung = final['Artikelbeschreibung'] || '';
      const kurzbeschreibung = final['Kurzbeschreibung'] || '';
      const csvItemUUID = typeof final.itemUUID === 'string' ? final.itemUUID.trim() : '';
      const suchbegriff = resolveSuchbegriffValue(final['Suchbegriff'], artikelbeschreibung, {
        rowNumber,
        artikelNummer: artikelNummer || null,
        itemUUID: csvItemUUID || null,
      });
      final.Suchbegriff = suchbegriff;
      const sanitizedLangtextValue = sanitizeLangtextCsvValue(final['Langtext'], {
        rowNumber,
        artikelNummer: artikelNummer || null,
        itemUUID: csvItemUUID || null,
      });
      const parsedLangtext = parseLangtext(sanitizedLangtextValue, {
        logger: console,
        context: 'csv-import:langtext',
        artikelNummer,
        itemUUID: csvItemUUID || null
      });
      if (parsedLangtext === null && sanitizedLangtextValue) {
        console.warn('[importer] Langtext CSV value rejected after sanitization; defaulting to empty string', {
          rowNumber,
          artikelNummer: artikelNummer || null
        });
      }
      let resolvedQuality: number | null | undefined;
      let langtext = parsedLangtext ?? '';
      if (parsedLangtext && typeof parsedLangtext === 'object' && !Array.isArray(parsedLangtext)) {
        const langtextPayload = { ...(parsedLangtext as Record<string, string>) };
        const qualityLabel = langtextPayload.Qualität ?? langtextPayload.Qualitaet;
        if (qualityLabel !== undefined) {
          try {
            const resolvedFromLabel = resolveQualityFromLabel(qualityLabel, console);
            if (resolvedFromLabel !== null) {
              resolvedQuality = normalizeQuality(resolvedFromLabel, console);
            } else {
              console.warn('[importer] Unable to resolve Qualität label from Langtext payload', {
                rowNumber,
                artikelNummer: artikelNummer || null,
                itemUUID: csvItemUUID || null,
                qualityLabel
              });
            }
          } catch (qualityError) {
            console.error('[importer] Failed to map Qualität label from Langtext payload', {
              rowNumber,
              artikelNummer: artikelNummer || null,
              itemUUID: csvItemUUID || null,
              qualityLabel,
              error: qualityError
            });
          }
          delete langtextPayload.Qualität;
          delete langtextPayload.Qualitaet;
        }
        langtext = langtextPayload;
      }
      const hersteller = final['Hersteller'] || '';
      const hkA = parseIntegerField(
        final['Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)'],
        'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true, categoryType: 'haupt' }
      );
      const ukA = parseIntegerField(
        final['Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)'],
        'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true, categoryType: 'unter' }
      );
      const hkB = parseIntegerField(
        final['Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)'],
        'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true, categoryType: 'haupt' }
      );
      const ukB = parseIntegerField(
        final['Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)'],
        'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true, categoryType: 'unter' }
      );
      const publishedStatus = ['yes', 'ja', 'true', '1'].includes((final['Veröffentlicht_Status'] || '').toLowerCase());
      const shopartikel =
        parseIntegerField(final['Shopartikel'], 'Shopartikel', { defaultValue: 0 }) ?? 0;
      const einheitRaw = final['Einheit'];
      const einheit = resolveCsvEinheit(einheitRaw, rowNumber);
      const hasExplicitEinheit =
        typeof einheitRaw === 'string' ? einheitRaw.trim().length > 0 : String(einheitRaw ?? '').trim().length > 0;
      const lengthMm =
        parseIntegerField(final['Länge(mm)'], 'Länge(mm)', { defaultValue: 0 }) ?? 0;
      const widthMm =
        parseIntegerField(final['Breite(mm)'], 'Breite(mm)', { defaultValue: 0 }) ?? 0;
      const heightMm =
        parseIntegerField(final['Höhe(mm)'], 'Höhe(mm)', { defaultValue: 0 }) ?? 0;
      const weightKg =
        parseDecimalField(final['Gewicht(kg)'], 'Gewicht(kg)', { defaultValue: 0 }) ?? 0;
      const verkaufspreis =
        parseDecimalField(final['Verkaufspreis'], 'Verkaufspreis', { defaultValue: 0 }) ?? 0;
      const resolvedQuantity = resolveQuantityFieldValue(final, rowNumber);
      const aufLager =
        parseIntegerField(resolvedQuantity.value, 'Auf_Lager', { defaultValue: 0 }) ?? 0;
      const categoryCodes = [hkA, ukA, hkB, ukB].filter((code): code is number => typeof code === 'number');
      const instancePlan = resolveInstancePlan(aufLager, einheit, {
        rowNumber,
        artikelNummer,
        legacySchemaDetected: legacySchema.detected,
        hasExplicitEinheit,
        categoryCodes,
      });

      if (instancePlan.instanceCount <= 0 || instancePlan.quantityPerItem <= 0) {
        console.info('CSV ingestion: skipping item persistence due to non-positive quantity', {
          rowNumber,
          artikelNummer,
          aufLager,
          einheit,
        });

        if (!artikelNummer) {
          console.warn('CSV ingestion: unable to persist item reference without Artikel-Nummer', {
            rowNumber,
          });
        } else {
          try {
            persistItemReference({
              Artikel_Nummer: artikelNummer,
              Suchbegriff: suchbegriff,
              Grafikname: grafikname,
              Artikelbeschreibung: artikelbeschreibung,
              Verkaufspreis: verkaufspreis,
              Kurzbeschreibung: kurzbeschreibung,
              Langtext: langtext,
              Quality: resolvedQuality,
              Hersteller: hersteller,
              Länge_mm: lengthMm,
              Breite_mm: widthMm,
              Höhe_mm: heightMm,
              Gewicht_kg: weightKg,
              Hauptkategorien_A: hkA,
              Unterkategorien_A: ukA,
              Hauptkategorien_B: hkB,
              Unterkategorien_B: ukB,
              Veröffentlicht_Status: publishedStatus,
              Shopartikel: shopartikel,
              Artikeltyp: final['Artikeltyp'] || '',
              Einheit: einheit,
              ImageNames: serializedImageNames,
            });
          } catch (error) {
            console.error('CSV ingestion: failed to persist zero-quantity item reference', {
              rowNumber,
              artikelNummer,
              error,
            });
          }
        }

        continue;
      }

      if (einheit !== ItemEinheit.Menge && instancePlan.instanceCount > 1) {
        console.info('[importer] Splitting legacy quantity into item instances', {
          rowNumber,
          artikelNummer,
          aufLager,
          instanceCount: instancePlan.instanceCount,
          einheit,
        });
      }
      let baseItemUUID = csvItemUUID;
      if (artikelNummer) {
        try {
          const existing = findByMaterial.get(artikelNummer) as { ItemUUID?: string } | undefined;
          if (existing?.ItemUUID) {
            baseItemUUID = existing.ItemUUID;
          }
        } catch (error) {
          console.error('[importer] Failed to lookup existing item by Artikel_Nummer', {
            rowNumber,
            artikelNummer,
            error,
          });
        }
      }

      if (!baseItemUUID) {
        try {
          if (!artikelNummerForMinting) {
            console.warn('[importer] Falling back to date-based ItemUUID minting due to missing/invalid Artikel_Nummer', {
              rowNumber,
              artikelNummer: artikelNummer || null,
              status: artikelNummerStatus,
            });
            baseItemUUID = mintSequentialIdentifier(ITEM_ID_PREFIX, identifierDate, itemSequenceByDate);
          } else {
            baseItemUUID = mintArtikelItemIdentifier(ITEM_ID_PREFIX, artikelNummerForMinting, itemSequenceByArtikelNummer);
          }
          console.log('[importer] Minted ItemUUID for CSV row', {
            rowNumber,
            artikelNummer: artikelNummer || null,
            itemUUID: baseItemUUID,
          });
          final.itemUUID = baseItemUUID;
        } catch (error) {
          console.error('[importer] Failed to mint ItemUUID for CSV row', {
            rowNumber,
            artikelNummer: artikelNummer || null,
            status: artikelNummerStatus,
            error,
          });
          continue;
        }
      } else if (final.itemUUID !== baseItemUUID) {
        final.itemUUID = baseItemUUID;
      }

      if (instancePlan.instanceCount > 1 && baseItemUUID) {
        console.info('[importer] Using primary ItemUUID for split quantity', {
          rowNumber,
          artikelNummer,
          itemUUID: baseItemUUID,
        });
      }

      let skipRemainingInstances = false;
      for (let instanceIndex = 0; instanceIndex < instancePlan.instanceCount; instanceIndex += 1) {
        let itemUUID = baseItemUUID;
        if (instanceIndex > 0) {
          try {
            if (!artikelNummerForMinting) {
              console.warn('[importer] Falling back to date-based ItemUUID minting due to missing/invalid Artikel_Nummer', {
                rowNumber,
                instanceIndex: instanceIndex + 1,
                artikelNummer: artikelNummer || null,
                status: artikelNummerStatus,
              });
              itemUUID = mintSequentialIdentifier(ITEM_ID_PREFIX, identifierDate, itemSequenceByDate);
            } else {
              itemUUID = mintArtikelItemIdentifier(ITEM_ID_PREFIX, artikelNummerForMinting, itemSequenceByArtikelNummer);
            }
            console.log('[importer] Minted ItemUUID for split item instance', {
              rowNumber,
              artikelNummer: artikelNummer || null,
              itemUUID,
              instanceIndex: instanceIndex + 1,
            });
          } catch (error) {
            console.error('[importer] Failed to mint ItemUUID for split item instance', {
              rowNumber,
              artikelNummer: artikelNummer || null,
              instanceIndex: instanceIndex + 1,
              status: artikelNummerStatus,
              error,
            });
            skipRemainingInstances = true;
            break;
          }
        }

        const item: Item = {
          ItemUUID: itemUUID,
          BoxID: normalizedBoxId,
          Location: locationId,
          UpdatedAt: nowDate,
          Datum_erfasst: parseDatumErfasst(final['Datum erfasst']),
          Artikel_Nummer: artikelNummer,
          Suchbegriff: suchbegriff,
          Grafikname: grafikname,
          Artikelbeschreibung: artikelbeschreibung,
          Auf_Lager: instancePlan.quantityPerItem,
          Verkaufspreis: verkaufspreis,
          Kurzbeschreibung: kurzbeschreibung,
          Langtext: langtext,
          Quality: resolvedQuality,
          Hersteller: hersteller,
          Länge_mm: lengthMm,
          Breite_mm: widthMm,
          Höhe_mm: heightMm,
          Gewicht_kg: weightKg,
          Hauptkategorien_A: hkA,
          Unterkategorien_A: ukA,
          Hauptkategorien_B: hkB,
          Unterkategorien_B: ukB,
          Veröffentlicht_Status: publishedStatus,
          Shopartikel: shopartikel,
          Artikeltyp: final['Artikeltyp'] || '',
          Einheit: einheit,
          ImageNames: serializedImageNames,
        };
        persistItem({
          ...item,
          UpdatedAt: nowDate
        });

        if (normalizedBoxId) {
          boxesTouched.add(normalizedBoxId);
        }
        count++;
      }
      if (skipRemainingInstances) {
        console.warn('[importer] Skipping remaining item instances after ItemUUID mint failure', {
          rowNumber,
          artikelNummer: artikelNummer || null,
        });
        continue;
      }
    }

    return { count, boxes: Array.from(boxesTouched) };
  } catch (err) {
    console.error('CSV ingestion failed', err);
    throw err;
  }
}

function normalizeEventField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return (typeof value === 'string' ? value : String(value)).trim();
  } catch (fieldError) {
    console.error('[importer] Failed to normalize event field value', { value, fieldError });
    return '';
  }
}

function normalizeEventCreatedAt(value: string, rowNumber: number): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      console.warn('[importer] Skipping events.csv row with invalid CreatedAt', { rowNumber, value });
      return null;
    }
    return value;
  } catch (error) {
    console.error('[importer] Failed to parse events.csv CreatedAt value', { rowNumber, value, error });
    return null;
  }
}

export async function ingestEventsCsv(data: Buffer | string): Promise<{ count: number; skipped: number }> {
  console.log('[importer] Ingesting events.csv payload');
  try {
    const content = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const records = parseCsvSync(content, { columns: true, skip_empty_lines: true }) as Array<Record<string, unknown>>;
    let count = 0;
    let skipped = 0;

    if (records.length === 0) {
      console.info('[importer] events.csv contained zero rows');
    }

    for (const [index, record] of records.entries()) {
      const rowNumber = index + 1;
      try {
        const createdAtRaw = normalizeEventField(record.CreatedAt);
        const createdAt = normalizeEventCreatedAt(createdAtRaw, rowNumber);
        const actor = normalizeEventField(record.Actor);
        const entityType = normalizeEventField(record.EntityType);
        const entityId = normalizeEventField(record.EntityId);
        const event = normalizeEventField(record.Event);
        const levelRaw = normalizeEventField(record.Level);
        const meta = normalizeEventField(record.Meta);

        const missingFields = EVENT_REQUIRED_FIELDS.filter((field) => {
          if (field === 'CreatedAt') {
            return !createdAt;
          }
          if (field === 'Level') {
            return !levelRaw;
          }
          if (field === 'EntityType') {
            return !entityType;
          }
          if (field === 'EntityId') {
            return !entityId;
          }
          if (field === 'Event') {
            return !event;
          }
          return false;
        });

        if (missingFields.length > 0) {
          console.warn('[importer] Skipping events.csv row missing required fields', {
            rowNumber,
            missingFields,
          });
          skipped += 1;
          continue;
        }

        const normalizedLevel = normalizeEventLogLevel(levelRaw);
        if (!normalizedLevel) {
          console.warn('[importer] Skipping events.csv row with invalid Level', {
            rowNumber,
            level: levelRaw,
          });
          skipped += 1;
          continue;
        }

        const inserted = insertEventLogEntry({
          CreatedAt: createdAt as string,
          Actor: actor || null,
          EntityType: entityType,
          EntityId: entityId,
          Event: event,
          Level: normalizedLevel,
          Meta: meta || null
        });

        if (inserted) {
          count += 1;
        } else {
          skipped += 1;
        }
      } catch (rowError) {
        console.error('[importer] Failed to normalize events.csv row', {
          rowNumber,
          error: rowError,
        });
        skipped += 1;
      }
    }

    console.info('[importer] Completed events.csv ingestion', { count, skipped });
    return { count, skipped };
  } catch (err) {
    console.error('[importer] Failed to ingest events CSV payload', err);
    throw err;
  }
}

function normalizeBoxField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return (typeof value === 'string' ? value : String(value)).trim();
  } catch (fieldError) {
    console.error('[importer] Failed to normalize box field value', { value, fieldError });
    return '';
  }
}

const SHELF_BOX_ID_PATTERN = /^S-\w{4}-\d-\d{4}-\d{4}$/;
const NON_SHELF_BOX_ID_PATTERN = /^(?:B-\d{6}-\d{4}|BIN-[A-Za-z0-9][A-Za-z0-9_-]*|[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*)$/;

function isValidShelfBoxId(value: string, context: { rowNumber: number }): boolean {
  try {
    return SHELF_BOX_ID_PATTERN.test(value);
  } catch (error) {
    console.error('[importer] Failed to validate shelf BoxID format', {
      ...context,
      boxId: value,
      error,
    });
    return false;
  }
}

function isValidNonShelfBoxId(value: string, context: { rowNumber: number }): boolean {
  try {
    return NON_SHELF_BOX_ID_PATTERN.test(value);
  } catch (error) {
    console.error('[importer] Failed to validate non-shelf BoxID format', {
      ...context,
      boxId: value,
      error,
    });
    return false;
  }
}

export async function ingestBoxesCsv(data: Buffer | string): Promise<{ count: number }> {
  console.log('[importer] Ingesting boxes.csv payload');
  const now = new Date().toISOString();
  try {
    const content = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const records = parseCsvSync(content, { columns: true, skip_empty_lines: true }) as Array<Record<string, unknown>>;
    let count = 0;

    if (records.length === 0) {
      console.info('[importer] boxes.csv contained zero rows');
    }

    for (const [index, record] of records.entries()) {
      const rowNumber = index + 1;
      try {
        const boxId = normalizeBoxField(record.BoxID ?? (record as Record<string, unknown>)?.boxid ?? null);
        if (!boxId) {
          console.warn('[importer] Skipping boxes.csv row without BoxID', { rowNumber });
          continue;
        }
        if (boxId.startsWith('S-')) {
          let isValidShelfId = false;
          try {
            isValidShelfId = isValidShelfBoxId(boxId, { rowNumber });
          } catch (validationError) {
            console.error('[importer] Shelf BoxID validation failed unexpectedly', {
              rowNumber,
              boxId,
              error: validationError,
            });
          }
          if (!isValidShelfId) {
            console.warn('[importer] Skipping boxes.csv row with invalid shelf BoxID', {
              rowNumber,
              boxId,
            });
            continue;
          }
        }

        const locationId = normalizeBoxField(record.LocationId ?? record.Location ?? record.Standort);
        const label = normalizeBoxField(record.Label ?? record.StandortLabel);
        const createdAt = normalizeBoxField(record.CreatedAt);
        const notes = normalizeBoxField(record.Notes);
        const photoPath = normalizeBoxField(record.PhotoPath);
        const placedBy = normalizeBoxField(record.PlacedBy);
        const placedAt = normalizeBoxField(record.PlacedAt);
        const updatedAt = normalizeBoxField(record.UpdatedAt) || now;

        const box: Box = {
          BoxID: boxId,
          LocationId: locationId || null,
          Label: label || null,
          CreatedAt: createdAt || null,
          Notes: notes || null,
          PhotoPath: photoPath || null,
          PlacedBy: placedBy || null,
          PlacedAt: placedAt || null,
          UpdatedAt: updatedAt,
        };

        try {
          runUpsertBox(box);
          count++;
        } catch (upsertError) {
          console.error('[importer] Failed to upsert box from boxes.csv row', {
            rowNumber,
            boxId,
            error: upsertError,
          });
        }
      } catch (rowError) {
        console.error('[importer] Failed to normalize boxes.csv row', {
          rowNumber,
          error: rowError,
        });
      }
    }

    return { count };
  } catch (err) {
    console.error('[importer] Failed to ingest boxes CSV payload', err);
    throw err;
  }
}

function normalizeAgenticRunField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return (typeof value === 'string' ? value : String(value)).trim();
  } catch (fieldError) {
    console.error('[importer] Failed to normalize agentic run field', { value, fieldError });
    return '';
  }
}

export async function ingestAgenticRunsCsv(data: Buffer | string): Promise<{ count: number; skippedMissingReferences: number }> {
  console.log('[importer] Ingesting agentic_runs.csv payload');
  const now = new Date().toISOString();
  try {
    const content = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const records = parseCsvSync(content, { columns: true, skip_empty_lines: true }) as Array<Record<string, unknown>>;
    let count = 0;
    let skippedMissingReferences = 0;

    if (records.length === 0) {
      console.info('[importer] agentic_runs.csv contained zero rows');
    }

    for (const [index, record] of records.entries()) {
      const rowNumber = index + 1;
      try {
        const artikelNummer = normalizeAgenticRunField(record.Artikel_Nummer);
        if (!artikelNummer) {
          console.warn('[importer] Skipping agentic_runs row without Artikel_Nummer', { rowNumber });
          continue;
        }

        const status = normalizeAgenticRunField(record.Status);
        if (!status) {
          console.warn('[importer] agentic_runs row missing Status; defaulting to notStarted', {
            rowNumber,
            artikelNummer,
          });
        }
        const lastModified = normalizeAgenticRunField(record.LastModified);
        if (!lastModified) {
          console.warn('[importer] agentic_runs row missing LastModified; defaulting to now', {
            rowNumber,
            artikelNummer,
          });
        }
        const reviewState = normalizeAgenticRunField(record.ReviewState) || 'not_required';

        const run = {
          Artikel_Nummer: artikelNummer,
          SearchQuery: normalizeAgenticRunField(record.SearchQuery) || null,
          Status: status || 'notStarted',
          LastModified: lastModified || now,
          ReviewState: reviewState,
          ReviewedBy: normalizeAgenticRunField(record.ReviewedBy) || null,
          LastReviewDecision: normalizeAgenticRunField(record.LastReviewDecision) || null,
          LastReviewNotes: normalizeAgenticRunField(record.LastReviewNotes) || null,
          LastSearchLinksJson: normalizeAgenticRunField(record.LastSearchLinksJson) || null
        };

        let hasParentItemReference = false;
        try {
          hasParentItemReference = hasItemReferenceByArtikelNummer(artikelNummer);
        } catch (lookupError) {
          console.error('[importer] Failed to verify item_refs parent for agentic_runs row', {
            rowNumber,
            artikelNummer,
            error: lookupError,
          });
          continue;
        }

        if (!hasParentItemReference) {
          skippedMissingReferences++;
          console.warn('[importer] Skipping agentic_runs row with missing parent item_refs reference', {
            rowNumber,
            artikelNummer,
            reason: 'missing_item_ref_for_agentic_run',
          });
          continue;
        }

        try {
          upsertAgenticRun.run(run);
          count++;
        } catch (upsertError) {
          console.error('[importer] Failed to upsert agentic run from agentic_runs row', {
            rowNumber,
            artikelNummer,
            error: upsertError,
          });
        }
      } catch (rowError) {
        console.error('[importer] Failed to parse agentic_runs row', {
          rowNumber,
          error: rowError,
        });
      }
    }

    return { count, skippedMissingReferences };
  } catch (err) {
    console.error('[importer] Failed to ingest agentic_runs CSV payload', err);
    throw err;
  }
}

function normalize(r: Record<string, unknown>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of Object.keys(r)) o[k] = String(r[k] ?? '').trim();
  return o;
}

function readCsv(file: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    fs.createReadStream(file)
      .pipe(parseCsvStream({ columns: true, trim: true }))
      .on('data', (d) => rows.push(d))
      .on('error', (err) => {
        console.error('CSV parse error', err);
        reject(err);
      })
      .on('end', () => resolve(rows));
  });
}

export default { ingestCsvFile, ingestBoxesCsv, ingestEventsCsv, ingestAgenticRunsCsv };
