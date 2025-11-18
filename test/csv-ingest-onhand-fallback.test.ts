import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-onhand-fallback.test.sqlite');
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'csv-onhand-fallback.csv');

// TODO(agent): Extend fixture coverage with additional quantity spellings once observed in production exports.

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

const selectItem = db.prepare(
  'SELECT Artikel_Nummer as ArtikelNummer, Auf_Lager as AufLager FROM items WHERE Artikel_Nummer = ?'
);

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-onhand-fallback.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-onhand-fallback.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion onhand fallback', () => {
  test('persists rows when only onhand quantity is provided', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(FIXTURE_FILE);
    } catch (error) {
      console.error('[csv-ingest-onhand-fallback.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);
    expect(Array.isArray(ingestionResult.boxes)).toBe(true);

    const storedItem = selectItem.get('ONH-001') as
      | { ArtikelNummer: string | null; AufLager: number | null }
      | undefined;
    expect(storedItem).toEqual({ ArtikelNummer: 'ONH-001', AufLager: 7 });
  });
});
