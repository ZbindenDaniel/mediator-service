jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  persistItem: jest.fn(),
  listItemsForExport: jest.fn(async () => []),
}));

// These tests verify ORDER BY Artikel_Nummer, ItemUUID ordering in listItemsForExport.
// Sorting is performed by Postgres; mocking the function would only test the mock itself.

describe.skip('listItemsForExport ordering — needs Postgres test DB', () => {
  test.todo('sorts exports by Artikel_Nummer with ItemUUID as a tie-breaker');
  test.todo('filters exports when itemIds are provided');
});
