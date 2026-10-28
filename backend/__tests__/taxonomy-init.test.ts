// Unit-tests the DB orchestration in initTaxonomy() by mocking ../db (the actual
// seed/read SQL is exercised by the Postgres-gated suites). Verifies: seed-on-empty,
// DB-authoritative when present, and seed-file fallback on any DB error.
jest.mock('../db', () => ({
  countTaxonomyCategories: jest.fn(),
  readTaxonomyFromDb: jest.fn(),
  seedTaxonomy: jest.fn()
}));

import { initTaxonomy, getItemCategories, loadTaxonomy, resetTaxonomyCache } from '../lib/taxonomy';
import * as db from '../db';
import { itemCategories } from '../../models/item-categories';

const mockDb = db as jest.Mocked<typeof db>;

const DB_CATEGORIES = [
  { code: 10, label: 'Edited', labelExternal: 'Edited', labelInternal: 'Computer', subcategories: [] }
];

describe('initTaxonomy DB orchestration', () => {
  beforeEach(() => {
    resetTaxonomyCache();
    jest.clearAllMocks();
    mockDb.seedTaxonomy.mockResolvedValue(undefined);
    mockDb.readTaxonomyFromDb.mockResolvedValue(DB_CATEGORIES as any);
  });

  it('seeds from the seed file when the DB is empty, then serves the DB copy', async () => {
    mockDb.countTaxonomyCategories.mockResolvedValue(0);
    const result = await initTaxonomy();
    // Seeded with the full seed-file taxonomy.
    expect(mockDb.seedTaxonomy).toHaveBeenCalledTimes(1);
    const seeded = mockDb.seedTaxonomy.mock.calls[0][0];
    expect(seeded.length).toBe(itemCategories.length);
    // DB is authoritative afterwards.
    expect(result).toBe(DB_CATEGORIES);
    expect(getItemCategories()).toBe(DB_CATEGORIES);
  });

  it('does not seed when the DB already has categories', async () => {
    mockDb.countTaxonomyCategories.mockResolvedValue(20);
    const result = await initTaxonomy();
    expect(mockDb.seedTaxonomy).not.toHaveBeenCalled();
    expect(result).toBe(DB_CATEGORIES);
    expect(getItemCategories()).toBe(DB_CATEGORIES);
  });

  it('falls back to the seed-file cache when the DB errors', async () => {
    mockDb.countTaxonomyCategories.mockRejectedValue(new Error('db down'));
    const result = await initTaxonomy();
    // Seed-file taxonomy is served (non-empty), never throws.
    expect(result.length).toBe(itemCategories.length);
    expect(getItemCategories().length).toBe(itemCategories.length);
  });

  it('keeps the seed-file cache when the DB is empty even after seeding', async () => {
    mockDb.countTaxonomyCategories.mockResolvedValue(0);
    mockDb.readTaxonomyFromDb.mockResolvedValue([]); // e.g. seed no-op'd
    const result = await initTaxonomy();
    expect(result.length).toBe(itemCategories.length);
  });
});

describe('loadTaxonomy still works with ../db mocked', () => {
  it('reads the seed file synchronously', () => {
    resetTaxonomyCache();
    expect(loadTaxonomy(true).length).toBe(itemCategories.length);
  });
});
