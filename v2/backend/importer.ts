import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { upsertBox, upsertItem, queueLabel } from './db';
import { Box, Item } from '../models';
import { Op } from './ops/types';

function loadOps(): Op[] {
  try {
    const dir = path.join(__dirname, 'ops');
    const entries = fs.readdirSync(dir);
    const files = [
      ...entries.filter((f) => f.endsWith('.ts')).sort(),
      ...entries.filter((f) => f.endsWith('.js')).sort(),
    ];

    const seen = new Set<string>();
    const modules: Op[] = [];
    for (const f of files) {
      const base = f.replace(/\.(ts|js)$/, '');
      if (seen.has(base)) continue;
      seen.add(base);
      const mod = require(path.join(dir, f));
      modules.push((mod.default || mod) as Op);
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
    const now = new Date().toISOString();
    const records = await readCsv(absPath);
    let count = 0;
    const boxesTouched = new Set<string>();

    for (const r of records) {
      const row = normalize(r);
      const final = applyOps(row);

      const box: Box = {
        BoxID: final.BoxID,
        Location: final.Location || '',
        CreatedAt: final.CreatedAt || '',
        Notes: final.Notes || '',
        PlacedBy: final.PlacedBy || '',
        PlacedAt: final.PlacedAt || '',
        UpdatedAt: now,
      };
      upsertBox.run(box);

      const item: Item = {
        ItemUUID: final.ItemUUID,
        BoxID: final.BoxID,
        Location: final.Location || '',
        UpdatedAt: now,
        Datum_erfasst: final.Datum_erfasst || '',
        Artikel_Nummer: final.Artikel_Nummer || '',
        Grafikname: final.Grafikname || '',
        Artikelbeschreibung: final.Artikelbeschreibung || '',
        Auf_Lager: parseInt(final.Auf_Lager || final.Qty || '0', 10) || 0,
        Verkaufspreis: parseFloat(final.Verkaufspreis || '0') || 0,
        Kurzbeschreibung: final.Kurzbeschreibung || '',
        Langtext: final.Langtext || '',
        Hersteller: final.Hersteller || '',
        Länge_mm: parseInt(final.Länge_mm || '0', 10) || 0,
        Breite_mm: parseInt(final.Breite_mm || '0', 10) || 0,
        Höhe_mm: parseInt(final.Höhe_mm || '0', 10) || 0,
        Gewicht_kg: parseFloat(final.Gewicht_kg || '0') || 0,
        Hauptkategorien_A: final.Hauptkategorien_A || '',
        Unterkategorien_A: final.Unterkategorien_A || '',
        Hauptkategorien_B: final.Hauptkategorien_B || '',
        Unterkategorien_B: final.Unterkategorien_B || '',
        Veröffentlicht_Status: final.Veröffentlicht_Status || '',
        Shopartikel: parseInt(final.Shopartikel || '0', 10) || 0,
        Artikeltyp: final.Artikeltyp || '',
        Einheit: final.Einheit || '',
        WmsLink: final.WmsLink || '',
      };
      upsertItem.run(item);

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
