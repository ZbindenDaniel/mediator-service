import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-datum-erfasst.test.sqlite');
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'csv-datum-erfasst', 'multi-format.csv');
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

const selectDatum = db.prepare('SELECT Datum_erfasst as DatumErfasst FROM items WHERE ItemUUID = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-datum-erfasst.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-datum-erfasst.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion Datum_erfasst normalization', () => {
  test('ingests multiple date formats and normalizes to ISO strings', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(FIXTURE_FILE);
    } catch (error) {
      console.error('[csv-ingest-datum-erfasst.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(5);
    expect(new Set(ingestionResult.boxes)).toEqual(
      new Set(['BOX-ISO-1', 'BOX-DOTS-1', 'BOX-SLASH-1', 'BOX-TIME-1', 'BOX-INVALID-1'])
    );

    const isoRecord = selectDatum.get('DATE-ISO-001') as { DatumErfasst: string | null } | undefined;
    const dotsRecord = selectDatum.get('DATE-DOTS-002') as { DatumErfasst: string | null } | undefined;
    const slashRecord = selectDatum.get('DATE-SLASH-003') as { DatumErfasst: string | null } | undefined;
    const timeRecord = selectDatum.get('DATE-TIME-004') as { DatumErfasst: string | null } | undefined;
    const invalidRecord = selectDatum.get('DATE-INVALID-005') as { DatumErfasst: string | null } | undefined;

    expect(isoRecord).toEqual({ DatumErfasst: '2024-01-31T12:34:56.000Z' });
    expect(dotsRecord).toEqual({ DatumErfasst: '2024-02-01T00:00:00.000Z' });
    expect(slashRecord).toEqual({ DatumErfasst: '2024-03-15T00:00:00.000Z' });
    expect(timeRecord).toEqual({ DatumErfasst: '2024-04-02T14:15:16.000Z' });
    expect(invalidRecord).toEqual({ DatumErfasst: null });
  });
});
