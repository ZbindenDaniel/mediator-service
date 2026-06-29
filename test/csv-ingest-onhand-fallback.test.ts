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

import path from 'path';
import { ingestCsvFile } from '../backend/importer';
import * as db from '../backend/db';

// TODO(agent): Extend fixture coverage with additional quantity spellings once observed in production exports.
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'csv-onhand-fallback.csv');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CSV ingestion onhand fallback', () => {
  test('persists rows when only onhand quantity is provided', async () => {
    const result = await ingestCsvFile(FIXTURE_FILE);

    expect(result.count).toBe(1);
    expect(Array.isArray(result.boxes)).toBe(true);
    expect(db.persistItem).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'ONH-001', Auf_Lager: 7 })
    );
  });
});
