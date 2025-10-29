import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-kivitendo-schema.test.sqlite');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'csv-kivitendo-schema');
const KIVITENDO_INITIAL = path.join(FIXTURE_DIR, 'kivitendo-initial.csv');
const KIVITENDO_UPDATE = path.join(FIXTURE_DIR, 'kivitendo-update.csv');

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

const selectItemByArtikel = db.prepare(
  'SELECT ItemUUID, Artikel_Nummer as ArtikelNummer, BoxID, Auf_Lager as AufLager FROM items WHERE Artikel_Nummer = ?'
);
const selectItemRef = db.prepare(
  'SELECT Grafikname, Artikelbeschreibung, Langtext, Verkaufspreis, Gewicht_kg as GewichtKg, Einheit, Veröffentlicht_Status as VStatus, Shopartikel FROM item_refs WHERE Artikel_Nummer = ?'
);
const selectBox = db.prepare('SELECT BoxID, Notes FROM boxes WHERE BoxID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-kivitendo-schema.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-kivitendo-schema.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion Kivitendo schema compatibility', () => {
  test('maps and updates rows on re-import', async () => {
    let initialResult: { count: number; boxes: string[] };
    try {
      initialResult = await ingestCsvFile(KIVITENDO_INITIAL);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Initial ingestion failed', error);
      throw error;
    }

    expect(initialResult.count).toBe(1);
    expect(initialResult.boxes).toEqual(['BIN-A-01']);

    const initialItem = selectItemByArtikel.get('KIV-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(initialItem).toEqual({
      ItemUUID: 'kivitendo-101',
      ArtikelNummer: 'KIV-001',
      BoxID: 'BIN-A-01',
      AufLager: 5,
    });

    const initialRef = selectItemRef.get('KIV-001') as
      | {
          Grafikname: string | null;
          Artikelbeschreibung: string | null;
          Langtext: string | null;
          Verkaufspreis: number | null;
          GewichtKg: number | null;
          Einheit: string | null;
          VStatus: string | null;
          Shopartikel: number | null;
        }
      | undefined;
    expect(initialRef).toEqual({
      Grafikname: 'kivi-image.png',
      Artikelbeschreibung: 'Kivitendo Artikel',
      Langtext: 'Langtext Notiz',
      Verkaufspreis: 17.49,
      GewichtKg: 1.25,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
    });

    const initialBox = selectBox.get('BIN-A-01') as { BoxID: string; Notes: string | null } | undefined;
    expect(initialBox).toEqual({ BoxID: 'BIN-A-01', Notes: '' });

    let updateResult: { count: number; boxes: string[] };
    try {
      updateResult = await ingestCsvFile(KIVITENDO_UPDATE);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Update ingestion failed', error);
      throw error;
    }

    expect(updateResult.count).toBe(1);
    expect(updateResult.boxes).toEqual(['BIN-A-01']);

    const updatedItem = selectItemByArtikel.get('KIV-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(updatedItem).toEqual({
      ItemUUID: 'kivitendo-101',
      ArtikelNummer: 'KIV-001',
      BoxID: 'BIN-A-01',
      AufLager: 8,
    });

    const updatedRef = selectItemRef.get('KIV-001') as
      | {
          Grafikname: string | null;
          Artikelbeschreibung: string | null;
          Langtext: string | null;
          Verkaufspreis: number | null;
          GewichtKg: number | null;
          Einheit: string | null;
          VStatus: string | null;
          Shopartikel: number | null;
        }
      | undefined;
    expect(updatedRef).toEqual({
      Grafikname: 'kivi-image-updated.jpg',
      Artikelbeschreibung: 'Kivitendo Artikel Aktualisiert',
      Langtext: 'Langtext Update',
      Verkaufspreis: 18.25,
      GewichtKg: 1.3,
      Einheit: 'Stk',
      VStatus: 'no',
      Shopartikel: 0,
    });

    const updatedBox = selectBox.get('BIN-A-01') as { BoxID: string; Notes: string | null } | undefined;
    expect(updatedBox).toEqual({ BoxID: 'BIN-A-01', Notes: '' });
  });
});
