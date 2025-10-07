import fs from 'fs';
import path from 'path';

// TODO: Add fixtures for future schema variants beyond Produkt-Nr.
const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-produkt-schema.test.sqlite');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'csv-produkt-schema');
const LEGACY_INITIAL = path.join(FIXTURE_DIR, 'legacy-initial.csv');
const LEGACY_UPDATE = path.join(FIXTURE_DIR, 'legacy-update.csv');
const PRODUKT_INITIAL = path.join(FIXTURE_DIR, 'produkt-initial.csv');
const PRODUKT_UPDATE = path.join(FIXTURE_DIR, 'produkt-update.csv');

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
  'SELECT Artikelbeschreibung, Langtext FROM item_refs WHERE Artikel_Nummer = ?'
);
const selectBoxNotes = db.prepare('SELECT Notes FROM boxes WHERE BoxID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-produkt-schema.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-produkt-schema.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion schema compatibility', () => {
  test('legacy schema updates existing rows on re-import', async () => {
    let legacyInitialResult: { count: number; boxes: string[] };
    try {
      legacyInitialResult = await ingestCsvFile(LEGACY_INITIAL);
    } catch (error) {
      console.error('[csv-ingest-produkt-schema.test] Legacy initial ingestion failed', error);
      throw error;
    }

    expect(legacyInitialResult.count).toBe(1);
    expect(legacyInitialResult.boxes).toEqual(['LEG-BOX-001']);

    const initialItem = selectItemByArtikel.get('LEG-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(initialItem).toEqual({
      ItemUUID: 'LEGACY-UUID-001',
      ArtikelNummer: 'LEG-001',
      BoxID: 'LEG-BOX-001',
      AufLager: 4
    });

    const initialNotes = selectBoxNotes.get('LEG-BOX-001') as { Notes: string | null } | undefined;
    expect(initialNotes).toEqual({ Notes: 'Legacy note' });

    let legacyUpdateResult: { count: number; boxes: string[] };
    try {
      legacyUpdateResult = await ingestCsvFile(LEGACY_UPDATE);
    } catch (error) {
      console.error('[csv-ingest-produkt-schema.test] Legacy update ingestion failed', error);
      throw error;
    }

    expect(legacyUpdateResult.count).toBe(1);
    expect(legacyUpdateResult.boxes).toEqual(['LEG-BOX-001']);

    const updatedItem = selectItemByArtikel.get('LEG-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(updatedItem).toEqual({
      ItemUUID: 'LEGACY-UUID-001',
      ArtikelNummer: 'LEG-001',
      BoxID: 'LEG-BOX-001',
      AufLager: 6
    });

    const updatedNotes = selectBoxNotes.get('LEG-BOX-001') as { Notes: string | null } | undefined;
    expect(updatedNotes).toEqual({ Notes: 'Legacy note aktualisiert' });
  });

  test('Produkt schema maps and updates rows on re-import', async () => {
    let produktInitialResult: { count: number; boxes: string[] };
    try {
      produktInitialResult = await ingestCsvFile(PRODUKT_INITIAL);
    } catch (error) {
      console.error('[csv-ingest-produkt-schema.test] Produkt initial ingestion failed', error);
      throw error;
    }

    expect(produktInitialResult.count).toBe(1);
    expect(produktInitialResult.boxes).toEqual(['BX-200']);

    const initialItem = selectItemByArtikel.get('PROD-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(initialItem).toEqual({
      ItemUUID: '080925-PROD-001',
      ArtikelNummer: 'PROD-001',
      BoxID: 'BX-200',
      AufLager: 5
    });

    const initialRef = selectItemRef.get('PROD-001') as
      | { Artikelbeschreibung: string | null; Langtext: string | null }
      | undefined;
    expect(initialRef).toEqual({
      Artikelbeschreibung: 'Produkt Artikel',
      Langtext: 'Aus Kurzbeschreibung'
    });

    const initialNotes = selectBoxNotes.get('BX-200') as { Notes: string | null } | undefined;
    expect(initialNotes).toEqual({ Notes: 'Lager-Behältnis: Regal A | Lagerraum: Raum 1' });

    let produktUpdateResult: { count: number; boxes: string[] };
    try {
      produktUpdateResult = await ingestCsvFile(PRODUKT_UPDATE);
    } catch (error) {
      console.error('[csv-ingest-produkt-schema.test] Produkt update ingestion failed', error);
      throw error;
    }

    expect(produktUpdateResult.count).toBe(1);
    expect(produktUpdateResult.boxes).toEqual(['BX-200']);

    const updatedItem = selectItemByArtikel.get('PROD-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(updatedItem).toEqual({
      ItemUUID: '080925-PROD-001',
      ArtikelNummer: 'PROD-001',
      BoxID: 'BX-200',
      AufLager: 8
    });

    const updatedRef = selectItemRef.get('PROD-001') as
      | { Artikelbeschreibung: string | null; Langtext: string | null }
      | undefined;
    expect(updatedRef).toEqual({
      Artikelbeschreibung: 'Produkt Artikel',
      Langtext: 'Aus Kurzbeschreibung aktualisiert'
    });

    const updatedNotes = selectBoxNotes.get('BX-200') as { Notes: string | null } | undefined;
    expect(updatedNotes).toEqual({ Notes: 'Lager-Behältnis: Regal A | Lagerraum: Raum 1' });
  });
});
