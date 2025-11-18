import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-insertdateset.test.sqlite');
const FIXTURE_FILE = path.join(
  __dirname,
  'fixtures',
  'csv-datum-erfasst',
  'kivitendo-insertdateset.csv'
);
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
const { db } = require('../backend/persistence');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');

const selectDatum = db.prepare('SELECT Datum_erfasst as DatumErfasst FROM items WHERE ItemUUID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-insertdateset.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-insertdateset.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

// TODO(agent): Extend insertdateset coverage when additional partner aliases surface.
describe('CSV ingestion insertdateset alias mapping', () => {
  test('persists Datum_erfasst from insertdateset-driven Kivitendo exports', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(FIXTURE_FILE);
    } catch (error) {
      console.error('[csv-ingest-insertdateset.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(1);
    expect(ingestionResult.boxes).toEqual([]);

    const record = selectDatum.get('kivitendo-9876') as { DatumErfasst: string | null } | undefined;
    expect(record).toEqual({ DatumErfasst: '2024-05-05T08:30:45.000Z' });
  });
});
