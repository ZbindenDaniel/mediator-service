import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-einheit-normalization.test.sqlite');
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'csv-einheit-normalization', 'einheit-normalization.csv');
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

const selectItemEinheit = db.prepare(
  'SELECT Einheit as Einheit FROM item_refs WHERE Artikel_Nummer = ?'
);

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-einheit-normalization.test] Failed to clear database', error);
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
    console.warn('[csv-ingest-einheit-normalization.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion Einheit normalization', () => {
  test('normalizes and defaults Einheit values to supported set', async () => {
    let ingestionResult: { count: number; boxes: string[] };
    try {
      ingestionResult = await ingestCsvFile(FIXTURE_FILE);
    } catch (error) {
      console.error('[csv-ingest-einheit-normalization.test] CSV ingestion failed', error);
      throw error;
    }

    expect(ingestionResult.count).toBe(5);
    expect(new Set(ingestionResult.boxes)).toEqual(
      new Set(['CSV-BOX-001', 'CSV-BOX-002', 'CSV-BOX-003', 'CSV-BOX-004', 'CSV-BOX-005'])
    );

    const expectations: Record<string, string> = {
      'EIN-001': 'Stk',
      'EIN-002': 'Stk',
      'EIN-003': 'Mix',
      'EIN-004': 'Stk',
      'EIN-005': 'Stk'
    };

    for (const [artikelNummer, expected] of Object.entries(expectations)) {
      const row = selectItemEinheit.get(artikelNummer) as { Einheit: string | null } | undefined;
      expect(row).toBeDefined();
      if (!row) {
        throw new Error(`Missing Einheit row for ${artikelNummer}`);
      }
      expect(row.Einheit).toBe(expected);
    }
  });
});
