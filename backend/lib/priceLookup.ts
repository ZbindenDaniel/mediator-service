import fs from 'fs';
import path from 'path';

// TODO(agent): Refresh cached price lookup entries when the data file changes on disk.

export interface PriceLookupRow {
  hauptkategorie?: unknown;
  unterkategorie?: unknown;
  artikeltyp?: unknown;
  verkaufspreis?: unknown;
  hinweis?: unknown;
}

interface NormalizedPriceLookupRow {
  hauptkategorie: number | null;
  unterkategorie: number | null;
  artikeltyp: string | null;
  verkaufspreis: number;
  hinweis: string | null;
}

interface PriceLookupInput {
  hauptkategorien?: Array<unknown>;
  unterkategorien?: Array<unknown>;
  artikeltyp?: unknown;
}

type PriceLookupLogger = Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;

const PRICE_LOOKUP_PATH = path.resolve(process.cwd(), 'data/price-lookup.json');

let cachedLookup: NormalizedPriceLookupRow[] | null = null;

function normalizeCategory(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeRow(entry: PriceLookupRow, index: number, logger: PriceLookupLogger): NormalizedPriceLookupRow | null {
  const hauptkategorie = normalizeCategory(entry.hauptkategorie);
  const unterkategorie = normalizeCategory(entry.unterkategorie);
  const artikeltyp = normalizeType(entry.artikeltyp);
  const verkaufspreis = normalizePrice(entry.verkaufspreis);

  if (verkaufspreis === null) {
    logger.warn?.('[price-lookup] Skipping row with invalid price', { index, verkaufspreis: entry.verkaufspreis });
    return null;
  }

  const hinweis = typeof entry.hinweis === 'string' ? entry.hinweis.trim() : null;

  return {
    hauptkategorie,
    unterkategorie,
    artikeltyp,
    verkaufspreis,
    hinweis
  };
}

function ensureLookup(logger: PriceLookupLogger = console): NormalizedPriceLookupRow[] {
  if (cachedLookup) {
    return cachedLookup;
  }

  try {
    const raw = fs.readFileSync(PRICE_LOOKUP_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PriceLookupRow[] | unknown;
    if (!Array.isArray(parsed)) {
      logger.error?.('[price-lookup] Price lookup file is not an array', { path: PRICE_LOOKUP_PATH });
      cachedLookup = [];
      return cachedLookup;
    }

    const normalized: NormalizedPriceLookupRow[] = [];
    parsed.forEach((entry, index) => {
      const row = normalizeRow(entry as PriceLookupRow, index, logger);
      if (row) {
        normalized.push(row);
      }
    });

    cachedLookup = normalized;
    logger.debug?.('[price-lookup] Loaded price lookup entries', { count: normalized.length });
  } catch (error) {
    logger.error?.('[price-lookup] Failed to load price lookup table', { path: PRICE_LOOKUP_PATH, error });
    cachedLookup = [];
  }

  return cachedLookup;
}

export function resetPriceLookupCache(): void {
  cachedLookup = null;
}

function dedupeCategories(values: Array<unknown>): number[] {
  const codes: number[] = [];
  for (const value of values) {
    const normalized = normalizeCategory(value);
    if (normalized === null) continue;
    if (!codes.includes(normalized)) {
      codes.push(normalized);
    }
  }
  return codes;
}

function matchesType(entryType: string | null, candidate: string | null): boolean {
  if (entryType === null) {
    return true;
  }
  if (candidate === null) {
    return false;
  }
  return entryType === candidate;
}

export function resolvePriceByCategoryAndType(
  input: PriceLookupInput,
  logger: PriceLookupLogger = console
): number | null {
  const lookup = ensureLookup(logger);
  if (!lookup.length) {
    logger.warn?.('[price-lookup] Price lookup table empty; skipping fallback resolution');
    return null;
  }

  const mainCategories = dedupeCategories(input.hauptkategorien ?? []);
  const subCategories = dedupeCategories(input.unterkategorien ?? []);
  const normalizedType = normalizeType(input.artikeltyp);

  const prioritizedMatchers: Array<(row: NormalizedPriceLookupRow) => boolean> = [
    (row) =>
      row.unterkategorie !== null &&
      subCategories.includes(row.unterkategorie) &&
      row.artikeltyp !== null &&
      matchesType(row.artikeltyp, normalizedType),
    (row) =>
      row.unterkategorie !== null && subCategories.includes(row.unterkategorie) && row.artikeltyp === null,
    (row) =>
      row.hauptkategorie !== null &&
      mainCategories.includes(row.hauptkategorie) &&
      row.artikeltyp !== null &&
      matchesType(row.artikeltyp, normalizedType),
    (row) => row.hauptkategorie !== null && mainCategories.includes(row.hauptkategorie) && row.artikeltyp === null,
    (row) =>
      row.hauptkategorie === null &&
      row.unterkategorie === null &&
      row.artikeltyp !== null &&
      matchesType(row.artikeltyp, normalizedType),
    (row) =>
      row.hauptkategorie === null &&
      row.unterkategorie === null &&
      row.artikeltyp === null
  ];

  for (const matcher of prioritizedMatchers) {
    const match = lookup.find((row) => matcher(row));
    if (match) {
      logger.info?.('[price-lookup] Resolved fallback sale price', {
        hauptkategorien: mainCategories,
        unterkategorien: subCategories,
        artikeltyp: normalizedType,
        appliedPrice: match.verkaufspreis,
        source: match.hinweis ?? 'price-lookup'
      });
      return match.verkaufspreis;
    }
  }

  logger.info?.('[price-lookup] No fallback sale price found', {
    hauptkategorien: mainCategories,
    unterkategorien: subCategories,
    artikeltyp: normalizedType
  });

  return null;
}
