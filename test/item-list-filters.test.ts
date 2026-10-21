import { buildSubcategoryNameLookup, filterAndSortItems, ItemListComputationOptions } from '../frontend/src/components/ItemListPage';
import { buildItemListQueryParams, getDefaultItemListFilters } from '../frontend/src/lib/itemListFiltersStorage';
import type { Item } from '../models';

function buildOptions(overrides: Partial<ItemListComputationOptions> = {}): ItemListComputationOptions {
  return {
    items: [],
    placementFilter: 'all',
    normalizedSearch: '',
    normalizedSubcategoryFilter: '',
    normalizedBoxFilter: '',
    stockFilter: 'any',
    normalizedAgenticFilter: null,
    shopPublicationFilter: 'all',
    imageFilter: 'all',
    priceFilter: 'all',
    sortKey: 'artikelnummer',
    sortDirection: 'asc',
    qualityThreshold: 0,
    qualityFilter: 'all',
    ...overrides
  };
}

const items = [
  {
    ItemUUID: 'I-laptop', Artikel_Nummer: '1', UpdatedAt: '2024-01-01',
    Artikelbeschreibung: 'Latitude 7490', Hersteller: 'Dell', SerialNumber: 'SN-ABC123',
    Langtext: { Prozessor: 'Intel Core i5-8350U', RAM: '16 GB' },
    Unterkategorien_A: 2112, BoxID: 'B-001', Location: 'S-0101-01', ShelfLabel: 'Regal Laptops'
  },
  {
    ItemUUID: 'I-screen', Artikel_Nummer: '2', UpdatedAt: '2024-01-01',
    Artikelbeschreibung: 'Bildschirm Gerät 24"', Hersteller: 'Eizo',
    Unterkategorien_A: 2201, BoxID: 'B-002', Location: 'S-0202-01'
  }
] as unknown as Item[];

const ids = (options: ItemListComputationOptions) =>
  filterAndSortItems(options).map((group) => group.summary.representativeItemId);

describe('item list search', () => {
  test('matches words in any order and across fields', () => {
    expect(ids(buildOptions({ items, normalizedSearch: '7490 dell' }))).toEqual(['I-laptop']);
  });

  test('finds serial numbers and spec values', () => {
    expect(ids(buildOptions({ items, normalizedSearch: 'abc123' }))).toEqual(['I-laptop']);
    expect(ids(buildOptions({ items, normalizedSearch: 'i5 16' }))).toEqual(['I-laptop']);
  });

  test('ignores accents', () => {
    expect(ids(buildOptions({ items, normalizedSearch: 'gerat' }))).toEqual(['I-screen']);
  });

  test('still finds everything the old substring match found', () => {
    expect(ids(buildOptions({ items, normalizedSearch: 'latitude 7490' }))).toEqual(['I-laptop']);
  });
});

describe('item list Behälter filter', () => {
  test('matches the shelf of an item that sits in a box', () => {
    expect(ids(buildOptions({ items, normalizedBoxFilter: 's-0101' }))).toEqual(['I-laptop']);
    expect(ids(buildOptions({ items, normalizedBoxFilter: 'b-002' }))).toEqual(['I-screen']);
  });
});

describe('item list Unterkategorie filter', () => {
  const subcategoryNames = buildSubcategoryNameLookup([
    { label: 'Computer', subcategories: [{ code: 2112, label: 'Laptops' }] },
    { label: 'Bildschirme', subcategories: [{ code: 2201, label: 'Monitore' }] }
  ]);

  test('matches by code as before', () => {
    expect(ids(buildOptions({ items, normalizedSubcategoryFilter: '2112' }))).toEqual(['I-laptop']);
  });

  test('matches by subcategory or category name', () => {
    expect(ids(buildOptions({ items, subcategoryNames, normalizedSubcategoryFilter: 'laptop' }))).toEqual(['I-laptop']);
    expect(ids(buildOptions({ items, subcategoryNames, normalizedSubcategoryFilter: 'bildschirm' }))).toEqual(['I-screen']);
  });
});

describe('item list server query', () => {
  test('text filters and sorting are not sent, so they never trigger a reload', () => {
    const query = buildItemListQueryParams({
      ...getDefaultItemListFilters(),
      searchTerm: 'dell',
      subcategoryFilter: '2112',
      boxFilter: 'B-001',
      sortKey: 'price'
    });
    expect(query.has('search')).toBe(false);
    expect(query.has('subcategory')).toBe(false);
    expect(query.has('box')).toBe(false);
    expect(query.has('sortKey')).toBe(false);
  });
});
