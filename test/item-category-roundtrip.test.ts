jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  persistItemWithinTransaction: jest.fn(async () => undefined),
  persistItem: jest.fn(),
  getItem: jest.fn(async () => null),
  getBox: jest.fn(async () => null),
  logEvent: jest.fn(async () => undefined),
  enqueueShopwareSyncJob: jest.fn(async () => undefined),
  generateShopwareCorrelationId: jest.fn(() => 'corr-id'),
  listRecentAgenticRunReviewHistoryBySubcategory: jest.fn(async () => []),
}));

// These tests verify category field round-trips through the full save-item HTTP handler.
// They require a live DATABASE_URL to read back Postgres JSON aggregation of category codes.

describe.skip('item category round-trip — needs Postgres test DB', () => {
  test.todo('persists and retrieves category metadata via ItemUUID fallback');
  test.todo('returns numeric category codes after create and update');
});
