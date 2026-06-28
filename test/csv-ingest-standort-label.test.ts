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

const TEST_CSV_FILE = path.join(__dirname, 'csv-ingest-standort-label.csv');

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

describe('CSV ingestion Standort label mapping', () => {
  test('persists derived Standort label for boxes and keeps item location code', async () => {
    const boxId = 'BOX-STANDORT-LABEL';
    const itemId = 'ITEM-STANDORT-LABEL';
    const artikelNummer = 'STANDORT-ART-001';

    const csvContent = [
      'itemUUID,BoxID,Standort,Artikel-Nummer,Artikelbeschreibung,Auf_Lager,Einheit',
      `${itemId},${boxId},A,${artikelNummer},Standort Testartikel,1,Menge`,
      '',
    ].join('\n');
    fs.writeFileSync(TEST_CSV_FILE, csvContent, 'utf8');

    const result = await ingestCsvFile(TEST_CSV_FILE);

    expect(result.count).toBe(1);
    expect(result.boxes).toContain(boxId);
    // Standort 'A' maps to label 'Rot' — verify the box was upserted with the derived label
    expect(db.runUpsertBox).toHaveBeenCalledWith(
      expect.objectContaining({ BoxID: boxId, LocationId: 'A', Label: 'Rot' })
    );
    // Item should be stored with Location='A' (the Standort code, not the label)
    expect(db.persistItem).toHaveBeenCalledWith(
      expect.objectContaining({ ItemUUID: itemId, Location: 'A' })
    );
  });
});
