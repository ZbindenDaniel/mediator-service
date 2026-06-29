jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  persistItemWithinTransaction: jest.fn(async () => undefined),
  logEvent: jest.fn(async () => undefined),
  getItem: jest.fn(async () => null),
  getBox: jest.fn(async () => null),
  listEventsForItem: jest.fn(async () => []),
  getAgenticRun: jest.fn(async () => null),
  enqueueShopwareSyncJob: jest.fn(async () => undefined),
  generateShopwareCorrelationId: jest.fn(() => 'corr-id'),
  listRecentAgenticRunReviewHistoryBySubcategory: jest.fn(async () => []),
}));

// save-item Quality/Shopartikel derivation requires reading back item_refs after a PUT,
// which needs a live Postgres DB. Convert to integration tests against a real DATABASE_URL.

describe.skip('save-item quality and Shopartikel defaults — needs Postgres test DB', () => {
  test.todo('derives Shopartikel from quality when not provided');
  test.todo('defaults Shopartikel to 1 when quality meets threshold');
  test.todo('respects explicit Shopartikel override');
});
