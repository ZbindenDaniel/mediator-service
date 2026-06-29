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

// Date-format normalization assertions require reading back from a live Postgres instance
// (Datum_erfasst is stored as a timestamptz column and read back as ISO strings).

describe.skip('CSV ingestion — needs Postgres test DB to verify Datum_erfasst round-trip', () => {
  test.todo('ingests multiple date formats and normalizes to ISO strings');
  test.todo('hydrates Datum_erfasst from insertdate alias when normalized column is missing');
});
