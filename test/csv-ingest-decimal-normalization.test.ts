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

const FIXTURE_FILE = path.join(
  __dirname,
  'fixtures',
  'csv-decimal-normalization',
  'decimal-commas.csv'
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CSV ingestion decimal normalization', () => {
  test('normalizes comma decimals and thousand separators across numeric fields', async () => {
    const result = await ingestCsvFile(FIXTURE_FILE);

    expect(result.count).toBe(1);
    expect(result.boxes).toContain('DEC-BOX-001');

    // persistItem handles both the instance and the ref for positive-quantity items
    expect(db.persistItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ItemUUID: 'DEC-ITEM-001',
        Auf_Lager: 2500,
        Verkaufspreis: expect.closeTo(1234.56, 2),
        'Länge_mm': 1234,
        'Breite_mm': 2345,
        'Höhe_mm': 3456,
        Gewicht_kg: expect.closeTo(7.89, 2),
        Hauptkategorien_A: 1002,
        Unterkategorien_A: 2003,
        Hauptkategorien_B: 4004,
        Unterkategorien_B: 5005,
        Shopartikel: 1,
      })
    );
  });
});
