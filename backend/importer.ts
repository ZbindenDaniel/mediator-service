import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { upsertBox, persistItem, queueLabel } from './db';
import { Box, Item } from '../models';
import { Op } from './ops/types';
import { resolveStandortLabel, normalizeStandortCode } from './standort-label';

const DEFAULT_EINHEIT = 'Stück';

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

    for (const r of records) {
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
      const hkA = parseInt(final['Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)'] || '', 10);
      const ukA = parseInt(final['Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)'] || '', 10);
      const hkB = parseInt(final['Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)'] || '', 10);
      const ukB = parseInt(final['Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)'] || '', 10);
      const item: Item = {
        ItemUUID: final.itemUUID,
        BoxID: final.BoxID || null,
        Location: location,
        UpdatedAt: nowDate,
        Datum_erfasst: final['Datum erfasst'] ? new Date(final['Datum erfasst']) : undefined,
        Artikel_Nummer: final['Artikel-Nummer'] || '',
        Grafikname: final['Grafikname(n)'] || '',
        Artikelbeschreibung: final['Artikelbeschreibung'] || '',
        Auf_Lager: parseInt(final['Auf_Lager'] || final['Qty'] || '0', 10) || 0,
        Verkaufspreis: parseFloat(final['Verkaufspreis'] || '0') || 0,
        Kurzbeschreibung: final['Kurzbeschreibung'] || '',
        Langtext: final['Langtext'] || '',
        Hersteller: final['Hersteller'] || '',
        Länge_mm: parseInt(final['Länge(mm)'] || '0', 10) || 0,
        Breite_mm: parseInt(final['Breite(mm)'] || '0', 10) || 0,
        Höhe_mm: parseInt(final['Höhe(mm)'] || '0', 10) || 0,
        Gewicht_kg: parseFloat(final['Gewicht(kg)'] || '0') || 0,
        Hauptkategorien_A: Number.isFinite(hkA) ? hkA : undefined,
        Unterkategorien_A: Number.isFinite(ukA) ? ukA : undefined,
        Hauptkategorien_B: Number.isFinite(hkB) ? hkB : undefined,
        Unterkategorien_B: Number.isFinite(ukB) ? ukB : undefined,
        Veröffentlicht_Status: ['yes', 'ja', 'true', '1'].includes((final['Veröffentlicht_Status'] || '').toLowerCase()),
        Shopartikel: parseInt(final['Shopartikel'] || '0', 10) || 0,
        Artikeltyp: final['Artikeltyp'] || '',
        Einheit: final['Einheit'] || DEFAULT_EINHEIT,
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
