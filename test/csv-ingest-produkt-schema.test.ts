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

// These tests verify DB-level upsert, box notes accumulation, and re-import semantics
// that require a live Postgres instance. Run via integration tests against a real DATABASE_URL.

describe.skip('CSV ingestion schema compatibility — needs Postgres test DB', () => {
  test.todo('legacy schema updates existing rows on re-import');
  test.todo('Produkt schema maps and updates rows on re-import');
  test.todo('Produkt schema drops stale note fragments between imports');
  test.todo('allows forcing zero stock ingestion via options');
});
