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
}));

// These tests verify the upsert contract between items and item_refs rows in Postgres.
// They require a live DATABASE_URL to assert DB state after persistItemWithinTransaction calls.

describe.skip('item persistence reference behavior — needs Postgres test DB', () => {
  test.todo('full item creation persists reference and instance rows');
  test.todo('creating an item from an existing reference leaves the reference row untouched');
});
