import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { upsertBox, persistItem, persistItemReference, queueLabel } from './db';
import { Box, Item, ItemEinheit, isItemEinheit } from '../models';
import { Op } from './ops/types';
import { resolveStandortLabel, normalizeStandortCode } from './standort-label';

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

function resolveCsvEinheit(value: unknown, rowNumber: number): ItemEinheit {
  let candidate = '';
  if (typeof value === 'string') {
    candidate = value.trim();
  } else if (value != null) {
    candidate = String(value).trim();
  }
  try {
    if (isItemEinheit(candidate)) {
      return candidate;
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

// TODO: Extend parsing to cover additional partner provided formats once discovered.

interface NumericParseOptions {
  defaultValue?: number;
  treatBlankAsUndefined?: boolean;
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
    return fallback;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const normalized = normalizeNumericValue(trimmed, false);
    if (normalized === null) {
      console.warn('CSV ingestion: failed to normalize integer field', { field: fieldName, value: trimmed });
    }

    const target = normalized ?? trimmed;
    const parsed = Number.parseInt(target, 10);

    if (Number.isNaN(parsed)) {
      console.warn('CSV ingestion: integer parse produced NaN', { field: fieldName, value: trimmed, normalized });
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

function applyOps(row: Record<string, string>): Record<string, string> {
  const ctx = {
    queueLabel: (itemUUID: string) => queueLabel.run(itemUUID),
    log: (...a: unknown[]) => console.log('[ops]', ...a),
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

export async function ingestCsvFile(absPath: string): Promise<{ count: number; boxes: string[] }> {
  console.log(`Ingesting CSV file: ${absPath}`);
  try {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const records = await readCsv(absPath);
    let count = 0;
    const boxesTouched = new Set<string>();

    for (const [index, r] of records.entries()) {
      const rowNumber = index + 1;
      const row = normalize(r);
      const final = applyOps(row);
      const rawStandort = final.Standort || final.Location || '';
      const normalizedStandort = normalizeStandortCode(rawStandort);
      const location = normalizedStandort || null;
      const standortLabel = resolveStandortLabel(normalizedStandort);
      if (normalizedStandort && !standortLabel) {
        console.warn('CSV ingestion: missing Standort label mapping', { standort: normalizedStandort });
      }
      if (final.BoxID) {
        const box: Box = {
          BoxID: final.BoxID,
          Location: location,
          StandortLabel: standortLabel,
          CreatedAt: final.CreatedAt || '',
          Notes: final.Notes || '',
          PlacedBy: final.PlacedBy || '',
          PlacedAt: final.PlacedAt || '',
          UpdatedAt: now,
        };
        upsertBox.run(box);
      }
      const artikelNummer = final['Artikel-Nummer'] || '';
      const grafikname = final['Grafikname(n)'] || '';
      const artikelbeschreibung = final['Artikelbeschreibung'] || '';
      const kurzbeschreibung = final['Kurzbeschreibung'] || '';
      const langtext = final['Langtext'] || '';
      const hersteller = final['Hersteller'] || '';
      const hkA = parseIntegerField(
        final['Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)'],
        'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true }
      );
      const ukA = parseIntegerField(
        final['Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)'],
        'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true }
      );
      const hkB = parseIntegerField(
        final['Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)'],
        'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true }
      );
      const ukB = parseIntegerField(
        final['Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)'],
        'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
        { treatBlankAsUndefined: true }
      );
      const publishedStatus = ['yes', 'ja', 'true', '1'].includes((final['Veröffentlicht_Status'] || '').toLowerCase());
      const shopartikel =
        parseIntegerField(final['Shopartikel'], 'Shopartikel', { defaultValue: 0 }) ?? 0;
      const einheit = resolveCsvEinheit(final['Einheit'], rowNumber);
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
      const aufLager =
        parseIntegerField(final['Auf_Lager'] || final['Qty'], 'Auf_Lager', { defaultValue: 0 }) ?? 0;

      if (aufLager <= 0) {
        console.info('CSV ingestion: skipping item persistence due to non-positive quantity', {
          rowNumber,
          artikelNummer,
          aufLager,
        });

        if (!artikelNummer) {
          console.warn('CSV ingestion: unable to persist item reference without Artikel-Nummer', {
            rowNumber,
          });
        } else {
          try {
            persistItemReference({
              Artikel_Nummer: artikelNummer,
              Grafikname: grafikname,
              Artikelbeschreibung: artikelbeschreibung,
              Verkaufspreis: verkaufspreis,
              Kurzbeschreibung: kurzbeschreibung,
              Langtext: langtext,
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
      const item: Item = {
        ItemUUID: final.itemUUID,
        BoxID: final.BoxID || null,
        Location: location,
        UpdatedAt: nowDate,
        Datum_erfasst: parseDatumErfasst(final['Datum erfasst']),
        Artikel_Nummer: artikelNummer,
        Grafikname: grafikname,
        Artikelbeschreibung: artikelbeschreibung,
        Auf_Lager: aufLager,
        Verkaufspreis: verkaufspreis,
        Kurzbeschreibung: kurzbeschreibung,
        Langtext: langtext,
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
      };
      persistItem({
        ...item,
        UpdatedAt: nowDate
      });

      boxesTouched.add(final.BoxID);
      count++;
    }

    return { count, boxes: Array.from(boxesTouched) };
  } catch (err) {
    console.error('CSV ingestion failed', err);
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
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (d) => rows.push(d))
      .on('error', (err) => {
        console.error('CSV parse error', err);
        reject(err);
      })
      .on('end', () => resolve(rows));
  });
}

export default { ingestCsvFile };
