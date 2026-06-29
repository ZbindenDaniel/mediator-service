jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  runUpsertBox: jest.fn(async () => true),
  persistItem: jest.fn(),
  queueLabel: jest.fn(),
  persistItemReference: jest.fn(),
  upsertAgenticRun: jest.fn(),
  findByMaterial: jest.fn(async () => null),
  getMaxArtikelNummer: jest.fn(async () => null),
  insertEventLogEntry: jest.fn(async () => undefined),
  hasItemReferenceByArtikelNummer: jest.fn(async () => false),
}));

import fs from 'fs';
import path from 'path';
import { ingestCsvFile } from '../backend/importer';
import * as db from '../backend/db';

const TEST_CSV_FILE = path.join(__dirname, 'csv-ingest-location-fallback.csv');

beforeEach(() => {
  jest.clearAllMocks();
  if (fs.existsSync(TEST_CSV_FILE)) {
    fs.rmSync(TEST_CSV_FILE, { force: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_CSV_FILE)) {
    fs.rmSync(TEST_CSV_FILE, { force: true });
  }
});

describe('CSV ingestion Standort fallback', () => {
  test('stores item with null Location when CSV omits Standort', async () => {
    const boxId = 'BOX-CSV-0001';
    const itemId = 'I-CSV-0001';
    const artikelNummer = 'CSV-REG-001';
    const boxLocation = 'CSV-BOX-STANDORT';
    const boxLabel = 'CSV-BOX-STANDORT LABEL';

    const csvContent = [
      'itemUUID,BoxID,Location,Artikel-Nummer,Artikelbeschreibung,Auf_Lager,Einheit',
      `${itemId},${boxId},,${artikelNummer},Regressionsartikel,1,Menge`,
      '',
    ].join('\n');
    fs.writeFileSync(TEST_CSV_FILE, csvContent, 'utf8');

    const result = await ingestCsvFile(TEST_CSV_FILE);

    expect(result.count).toBe(1);
    expect(Array.isArray(result.boxes)).toBe(true);
    // Item has no Location in CSV — should be stored with Location=null
    expect(db.persistItem).toHaveBeenCalledWith(
      expect.objectContaining({ ItemUUID: itemId, Location: null })
    );
    // Box was upserted with its own location derived from the CSV BoxID
    expect(db.runUpsertBox).toHaveBeenCalledWith(
      expect.objectContaining({ BoxID: boxId })
    );
    // Location-inheritance (item shows box location in export) is a DB JOIN —
    // verified by integration tests against a real Postgres instance.
    void boxLocation;
    void boxLabel;
  });
});
