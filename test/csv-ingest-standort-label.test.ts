import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-standort-label.test.sqlite');
const TEST_CSV_FILE = path.join(__dirname, 'csv-ingest-standort-label.csv');
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
const { db, listBoxes, listItemsForExport } = require('../backend/persistence');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');

const selectBox = db.prepare('SELECT BoxID, Location, StandortLabel FROM boxes WHERE BoxID = ?');
const selectItem = db.prepare('SELECT ItemUUID, Location FROM items WHERE ItemUUID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-standort-label.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-standort-label.test] Failed to close database cleanly', error);
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

describe('CSV ingestion Standort label mapping', () => {
  test('persists derived Standort label for boxes and keeps item location code', async () => {
    const boxId = 'BOX-STANDORT-LABEL';
    const itemId = 'ITEM-STANDORT-LABEL';
    const artikelNummer = 'STANDORT-ART-001';

    const csvContent = [
      'itemUUID,BoxID,Standort,Artikel-Nummer,Artikelbeschreibung',
      `${itemId},${boxId},A,${artikelNummer},Standort Testartikel`,
      '',
    ].join('\n');

    fs.writeFileSync(TEST_CSV_FILE, csvContent, 'utf8');

    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(TEST_CSV_FILE);
    } catch (error) {
      console.error('[csv-ingest-standort-label.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);
    expect(ingestionResult.boxes).toContain(boxId);

    const persistedBox = selectBox.get(boxId) as { BoxID: string; Location: string | null; StandortLabel: string | null } | undefined;
    expect(persistedBox).toEqual({ BoxID: boxId, Location: 'A', StandortLabel: 'Rot' });

    const exported = listBoxes.all() as Array<{ BoxID: string; StandortLabel?: string | null }>;
    expect(exported.find((b) => b.BoxID === boxId)?.StandortLabel).toBe('Rot');

    const persistedItem = selectItem.get(itemId) as { ItemUUID: string; Location: string | null } | undefined;
    expect(persistedItem).toEqual({ ItemUUID: itemId, Location: 'A' });

    const exportItems = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    expect(exportItems.find((row: any) => row.ItemUUID === itemId)?.Location).toBe('A');
  });
});
