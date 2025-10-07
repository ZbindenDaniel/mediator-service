import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-location-fallback.test.sqlite');
const TEST_CSV_FILE = path.join(__dirname, 'csv-ingest-location-fallback.csv');
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
const { db, listItemsForExport, upsertBox } = require('../backend/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');

const selectItemLocation = db.prepare('SELECT Location FROM items WHERE ItemUUID = ?');
const selectBoxLocation = db.prepare('SELECT Location FROM boxes WHERE BoxID = ?');
const selectBoxStandortLabel = db.prepare('SELECT StandortLabel FROM boxes WHERE BoxID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-location-fallback.test] Failed to clear database', error);
    throw error;
  }
}

beforeEach(() => {
  clearDatabase();
  if (fs.existsSync(TEST_CSV_FILE)) {
    fs.rmSync(TEST_CSV_FILE, { force: true });
  }
});

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[csv-ingest-location-fallback.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (fs.existsSync(TEST_CSV_FILE)) {
    fs.rmSync(TEST_CSV_FILE, { force: true });
  }
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion Standort fallback', () => {
  test('exports inherited box Standort when item omits Location', async () => {
    const boxId = 'BOX-CSV-0001';
    const itemId = 'I-CSV-0001';
    const artikelNummer = 'CSV-REG-001';
    const boxLocation = 'CSV-BOX-STANDORT';
    const boxStandortLabel = 'CSV-BOX-STANDORT LABEL';
    const nowIso = new Date().toISOString();

    try {
      upsertBox.run({
        BoxID: boxId,
        Location: boxLocation,
        StandortLabel: boxStandortLabel,
        CreatedAt: nowIso,
        Notes: null,
        PlacedBy: null,
        PlacedAt: null,
        UpdatedAt: nowIso,
      });
    } catch (error) {
      console.error('[csv-ingest-location-fallback.test] Failed to seed box fixture', error);
      throw error;
    }

    const csvContent = [
      'itemUUID,BoxID,Location,Artikel-Nummer,Artikelbeschreibung',
      `${itemId},${boxId},,${artikelNummer},Regressionsartikel`,
      '',
    ].join('\n');

    fs.writeFileSync(TEST_CSV_FILE, csvContent, 'utf8');

    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(TEST_CSV_FILE);
    } catch (error) {
      console.error('[csv-ingest-location-fallback.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);
    expect(Array.isArray(ingestionResult.boxes)).toBe(true);

    const exported = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    expect(exported.length).toBe(1);
    expect(exported[0].ItemUUID).toBe(itemId);
    expect(exported[0].Location).toBe(boxLocation);

    const persistedItemLocation = selectItemLocation.get(itemId) as { Location: string | null } | undefined;
    expect(persistedItemLocation).toEqual({ Location: null });

    const persistedBoxLocation = selectBoxLocation.get(boxId) as { Location: string | null } | undefined;
    expect(persistedBoxLocation).toEqual({ Location: boxLocation });

    const persistedBoxStandortLabel = selectBoxStandortLabel.get(boxId) as { StandortLabel: string | null } | undefined;
    expect(persistedBoxStandortLabel).toEqual({ StandortLabel: boxStandortLabel });
  });
});
