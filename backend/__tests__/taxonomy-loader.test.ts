import { loadTaxonomy, parseTaxonomySeed, getItemCategories, resetTaxonomyCache } from '../lib/taxonomy';
import { itemCategories } from '../../models/item-categories';

describe('taxonomy loader', () => {
  beforeEach(() => resetTaxonomyCache());

  it('loads the seed as a faithful snapshot of the current hardcoded taxonomy', () => {
    const loaded = loadTaxonomy(true);
    // Same categories, order, codes, and display labels.
    expect(loaded.map((c) => c.code)).toEqual(itemCategories.map((c) => c.code));
    for (let i = 0; i < itemCategories.length; i++) {
      const src = itemCategories[i];
      const got = loaded[i];
      expect(got.label).toBe(src.label);
      expect(got.subcategories.map((s) => s.code)).toEqual(src.subcategories.map((s) => s.code));
      for (let j = 0; j < src.subcategories.length; j++) {
        expect(got.subcategories[j].label).toBe(src.subcategories[j].label);
        expect(got.subcategories[j].parentCode).toBe(src.code);
      }
    }
  });

  it('populates labelInternal/labelExternal and intake flags', () => {
    const loaded = loadTaxonomy(true);
    const laptop = loaded.find((c) => c.code === 20)?.subcategories.find((s) => s.code === 201);
    expect(laptop?.labelExternal).toBe('Laptop');
    expect(laptop?.labelInternal).toBe('Laptop');
    expect(laptop?.intakeEnabled).toBe(true);
    expect(laptop?.intakeLabel).toBe('Laptop');
  });

  it('getItemCategories lazy-loads and caches', () => {
    resetTaxonomyCache();
    const a = getItemCategories();
    const b = getItemCategories();
    expect(a).toBe(b); // same cached reference
    expect(a.length).toBe(itemCategories.length);
  });

  it('rejects a seed with duplicate subcategory codes', () => {
    const bad = {
      version: 1,
      categories: [
        { code: 10, labelExternal: 'A', subcategories: [
          { code: 101, labelExternal: 'x' },
          { code: 101, labelExternal: 'y' }
        ] }
      ]
    };
    expect(() => parseTaxonomySeed(bad)).toThrow(/duplicate subcategory code/);
  });

  it('rejects non-ascending category codes and a bad parent link', () => {
    expect(() => parseTaxonomySeed({ version: 1, categories: [
      { code: 20, labelExternal: 'B', subcategories: [] },
      { code: 10, labelExternal: 'A', subcategories: [] }
    ] })).toThrow(/must ascend/);
    expect(() => parseTaxonomySeed({ version: 1, categories: [
      { code: 10, labelExternal: 'A', subcategories: [{ code: 101, labelExternal: 'x', parentCode: 99 }] }
    ] })).toThrow(/parentCode/);
  });
});
