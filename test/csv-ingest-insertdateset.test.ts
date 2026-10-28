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
  logEvent: jest.fn(async () => undefined),
  hasItemReferenceByArtikelNummer: jest.fn(async () => false),
}));

import path from 'path';
import { ingestCsvFile, parseDatumErfasst } from '../backend/importer';
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
        // 08:30:45 Zurich wall time (CEST, UTC+2)
        Datum_erfasst: new Date('2024-05-05T06:30:45.000Z'),
      })
    );
  });
});

describe('parseDatumErfasst', () => {
  test('reads zone-less timestamps as Zurich wall time (summer and winter)', () => {
    expect(parseDatumErfasst('2024-07-01 10:00:00')?.toISOString()).toBe('2024-07-01T08:00:00.000Z');
    expect(parseDatumErfasst('2024-01-15T10:00')?.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    expect(parseDatumErfasst('18.04.2024 14:15:16')?.toISOString()).toBe('2024-04-18T12:15:16.000Z');
  });

  test('settles the offset across the DST switch', () => {
    // 2024-03-31 02:00 CET → 03:00 CEST; 03:30 is already summer time
    expect(parseDatumErfasst('2024-03-31 03:30:00')?.toISOString()).toBe('2024-03-31T01:30:00.000Z');
    expect(parseDatumErfasst('2024-03-31 01:30:00')?.toISOString()).toBe('2024-03-31T00:30:00.000Z');
  });

  test('keeps zoned timestamps and date-only values as they are', () => {
    expect(parseDatumErfasst('2024-01-31T12:34:56.000Z')?.toISOString()).toBe('2024-01-31T12:34:56.000Z');
    expect(parseDatumErfasst('2024-01-31T12:34:56+01:00')?.toISOString()).toBe('2024-01-31T11:34:56.000Z');
    expect(parseDatumErfasst('13.02.2024')?.toISOString()).toBe('2024-02-13T00:00:00.000Z');
    expect(parseDatumErfasst('2024-01-31')?.toISOString()).toBe('2024-01-31T00:00:00.000Z');
    expect(parseDatumErfasst('05/03/2024')?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(parseDatumErfasst('not a date')).toBeUndefined();
  });
});
