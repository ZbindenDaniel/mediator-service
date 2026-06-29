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

// These tests verify that the DB upsert layer de-duplicates item_refs correctly
// across multiple rows sharing the same Artikel-Nummer. Requires a live Postgres instance.

describe.skip('CSV ingestion for shared Artikel-Nummer rows — needs Postgres test DB', () => {
  test.todo('persists one item instance per row while keeping one item_ref record');
  test.todo('mints/falls back ItemUUID when CSV row omits itemUUID');
});
