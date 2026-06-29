jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  persistItem: jest.fn(),
  listItems: jest.fn(async () => []),
  listItemsForExport: jest.fn(async () => []),
}));

// These tests verify that Langtext is serialized into the list/export APIs as expected.
// They require a live DATABASE_URL because Langtext is stored as a JSONB column and read
// back via Postgres JSON operators in listItems / listItemsForExport.

describe.skip('Langtext contract alignment — needs Postgres test DB', () => {
  test.todo('list APIs surface parsed Langtext payloads including string arrays');
});
