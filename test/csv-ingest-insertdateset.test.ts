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

// TODO(agent): Extend insertdateset coverage when additional partner aliases surface.
const FIXTURE_FILE = path.join(
  __dirname,
  'fixtures',
  'csv-datum-erfasst',
  'kivitendo-insertdateset.csv'
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CSV ingestion insertdateset alias mapping', () => {
  test('persists Datum_erfasst from insertdateset-driven Kivitendo exports', async () => {
    const result = await ingestCsvFile(FIXTURE_FILE);

    expect(result.count).toBe(1);
    expect(result.boxes).toEqual([]);
    expect(db.persistItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ItemUUID: 'kivitendo-9876',
        Datum_erfasst: new Date('2024-05-05T08:30:45.000Z'),
      })
    );
  });
});
