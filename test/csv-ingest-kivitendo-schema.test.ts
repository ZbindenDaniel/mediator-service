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

// These tests verify DB-level upsert and re-import semantics that require a live Postgres instance.
// Run them via the integration test suite against a real DATABASE_URL.

describe.skip('CSV ingestion Kivitendo schema compatibility — needs Postgres test DB', () => {
  test.todo('maps and updates rows on re-import');
  test.todo('skips zero quantity rows but persists references');
  test.todo('ingests relaxed header variant with insertdate fallback');
  test.todo('maintains deterministic identifiers when only insertdate is provided across re-imports');
  test.todo('mints Artikelnummer when CSV row omits identifier');
  test.todo('hydrates Datum_erfasst from insertdate alias when normalized column is missing');
  test.todo('persists multi-image metadata and exporter fallback');
});
