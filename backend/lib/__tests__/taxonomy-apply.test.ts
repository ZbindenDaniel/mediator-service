const queries: Array<{ sql: string; params: unknown[] }> = [];
let existingParents: Record<number, number> = {};

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) =>
    fn({
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.startsWith('SELECT parent_code')) {
          const parent = existingParents[params[0] as number];
          return { rows: parent === undefined ? [] : [{ parent_code: parent }] };
        }
        if (sql.startsWith('UPDATE taxonomy_subcategories')) return { rows: [{ code: 102 }, { code: 202 }] };
        if (sql.startsWith('UPDATE taxonomy_categories')) return { rows: [{ code: 10 }] };
        return { rows: [] };
      })
    })),
}));

import { applyTaxonomy } from '../taxonomy-apply';
import { parseTaxonomySeed } from '../taxonomy';

const seed = parseTaxonomySeed({
  version: 1,
  categories: [
    { code: 20, labelExternal: 'Laptop', subcategories: [{ code: 201, labelExternal: 'Laptop' }] },
    { code: 210, labelExternal: 'Laptop-Komponenten', subcategories: [{ code: 2101, labelExternal: 'Displayassembly' }] },
  ],
});

beforeEach(() => { queries.length = 0; existingParents = {}; });

describe('applyTaxonomy', () => {
  it('upserts the file and deactivates everything else', async () => {
    const result = await applyTaxonomy(seed);
    expect(result).toEqual({ categoriesUpserted: 2, subcategoriesUpserted: 2, categoriesDeactivated: [10], subcategoriesDeactivated: [102, 202] });
    const deactivateSubs = queries.find((q) => q.sql.startsWith('UPDATE taxonomy_subcategories'))!;
    expect(deactivateSubs.params).toEqual([[201, 2101]]);
    expect(queries.filter((q) => q.sql.includes('ON CONFLICT (code) DO UPDATE')).length).toBe(4);
  });

  it('can leave other categories active', async () => {
    const result = await applyTaxonomy(seed, { deactivateMissing: false });
    expect(result.categoriesDeactivated).toEqual([]);
    expect(queries.some((q) => q.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('refuses to reparent an existing subcategory', async () => {
    existingParents = { 2101: 20 };
    await expect(applyTaxonomy(seed)).rejects.toThrow(/reparenting/);
  });
});
