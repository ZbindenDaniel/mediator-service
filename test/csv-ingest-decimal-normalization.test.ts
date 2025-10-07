import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-decimal-normalization.test.sqlite');
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'csv-decimal-normalization', 'decimal-commas.csv');
const ORIGINAL_DB_PATH = process.env.DB_PATH;

function removeTestDatabase() {
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${TEST_DB_FILE}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }
}

removeTestDatabase();
process.env.DB_PATH = TEST_DB_FILE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../backend/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');

const selectItemQuantities = db.prepare('SELECT Auf_Lager as AufLager FROM items WHERE ItemUUID = ?');
const selectItemReferenceNumbers = db.prepare(
  `
    SELECT
      Verkaufspreis as Verkaufspreis,
      Länge_mm as LaengeMm,
      Breite_mm as BreiteMm,
      Höhe_mm as HoeheMm,
      Gewicht_kg as GewichtKg,
      Hauptkategorien_A as HauptA,
      Unterkategorien_A as UnterA,
      Hauptkategorien_B as HauptB,
      Unterkategorien_B as UnterB,
      Shopartikel as Shopartikel
    FROM item_refs
    WHERE Artikel_Nummer = ?
  `
);

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-decimal-normalization.test] Failed to clear database', error);
    throw error;
  }
}

beforeEach(() => {
  clearDatabase();
});

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[csv-ingest-decimal-normalization.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion decimal normalization', () => {
  test('normalizes comma decimals and thousand separators across numeric fields', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(FIXTURE_FILE);
    } catch (error) {
      console.error('[csv-ingest-decimal-normalization.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);
    expect(ingestionResult.boxes).toEqual(['DEC-BOX-001']);

    const itemQuantities = selectItemQuantities.get('DEC-ITEM-001') as { AufLager: number | null } | undefined;
    expect(itemQuantities).toEqual({ AufLager: 2500 });

    const itemReference = selectItemReferenceNumbers.get('DEC-ART-001') as
      | {
          Verkaufspreis: number | null;
          LaengeMm: number | null;
          BreiteMm: number | null;
          HoeheMm: number | null;
          GewichtKg: number | null;
          HauptA: number | null;
          UnterA: number | null;
          HauptB: number | null;
          UnterB: number | null;
          Shopartikel: number | null;
        }
      | undefined;

    expect(itemReference).toBeDefined();
    if (!itemReference) {
      throw new Error('Item reference row is required for assertions');
    }

    expect(itemReference.Verkaufspreis).not.toBeNull();
    expect(itemReference.Verkaufspreis ?? 0).toBeCloseTo(1234.56, 2);
    expect(itemReference.LaengeMm).toBe(1234);
    expect(itemReference.BreiteMm).toBe(2345);
    expect(itemReference.HoeheMm).toBe(3456);
    expect(itemReference.GewichtKg).not.toBeNull();
    expect(itemReference.GewichtKg ?? 0).toBeCloseTo(7.89, 2);
    expect(itemReference.HauptA).toBe(1002);
    expect(itemReference.UnterA).toBe(2003);
    expect(itemReference.HauptB).toBe(4004);
    expect(itemReference.UnterB).toBe(5005);
    expect(itemReference.Shopartikel).toBe(1);
  });
});
