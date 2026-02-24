import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-shared-artikelnummer.test.sqlite');
const MULTI_UUID_FIXTURE = path.join(__dirname, 'fixtures', 'csv-shared-artikelnummer-multi.csv');
const MISSING_UUID_FIXTURE = path.join(__dirname, 'fixtures', 'csv-shared-artikelnummer-missing-itemuuid.csv');

// TODO(agent): Add a multi-row missing-UUID fixture if importer fallback precedence changes.

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

const selectItemUUIDsByArtikel = db.prepare(
  'SELECT ItemUUID FROM items WHERE Artikel_Nummer = ? ORDER BY ItemUUID'
);
const selectItemCountByArtikel = db.prepare(
  'SELECT COUNT(*) as count FROM items WHERE Artikel_Nummer = ?'
);
const selectItemRefCountByArtikel = db.prepare(
  'SELECT COUNT(*) as count FROM item_refs WHERE Artikel_Nummer = ?'
);

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-shared-artikelnummer.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-shared-artikelnummer.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion for shared Artikel-Nummer rows', () => {
  test('persists one item instance per row while keeping one item_ref record', async () => {
    const expectedItemUUIDs = ['SHARED-UUID-001', 'SHARED-UUID-002', 'SHARED-UUID-003'];
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(MULTI_UUID_FIXTURE);
    } catch (error) {
      console.error('[csv-ingest-shared-artikelnummer.test] Shared Artikel-Nummer ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(expectedItemUUIDs.length);

    const itemCountRow = selectItemCountByArtikel.get('SHARED-ART-001') as { count: number };
    expect(itemCountRow.count).toBe(expectedItemUUIDs.length);

    const storedItemUUIDs = (selectItemUUIDsByArtikel.all('SHARED-ART-001') as Array<{ ItemUUID: string }>).map(
      (row) => row.ItemUUID
    );
    expect(storedItemUUIDs).toEqual(expectedItemUUIDs);

    const refCountRow = selectItemRefCountByArtikel.get('SHARED-ART-001') as { count: number };
    expect(refCountRow.count).toBe(1);
  });

  test('mints/falls back ItemUUID when CSV row omits itemUUID', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(MISSING_UUID_FIXTURE);
    } catch (error) {
      console.error('[csv-ingest-shared-artikelnummer.test] Missing ItemUUID ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);

    const storedItemRows = selectItemUUIDsByArtikel.all('SHARED-ART-MINT-001') as Array<{ ItemUUID: string }>;
    expect(storedItemRows).toHaveLength(1);
    expect(storedItemRows[0].ItemUUID).toBeTruthy();

    const refCountRow = selectItemRefCountByArtikel.get('SHARED-ART-MINT-001') as { count: number };
    expect(refCountRow.count).toBe(1);
  });
});
