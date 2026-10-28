import { filterAndSortItems, ItemListComputationOptions } from '../frontend/src/components/ItemListPage';
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
    sortKey: 'price',
    sortDirection: 'asc',
    qualityThreshold: 0,
    qualityFilter: 'all',
    ...overrides
  };
}

describe('item list price filtering and sorting', () => {
  const items = [
    { ItemUUID: 'I-cheap', Artikel_Nummer: '1', Verkaufspreis: 10, UpdatedAt: '2024-01-01' },
    { ItemUUID: 'I-zero', Artikel_Nummer: '2', Verkaufspreis: 0, UpdatedAt: '2024-01-01' },
    { ItemUUID: 'I-pricey', Artikel_Nummer: '3', Verkaufspreis: 250, UpdatedAt: '2024-01-01' },
    { ItemUUID: 'I-empty', Artikel_Nummer: '4', Verkaufspreis: null, UpdatedAt: '2024-01-01' }
  ] as unknown as Item[];

  const ids = (options: ItemListComputationOptions) =>
    filterAndSortItems(options).map((group) => group.summary.representativeItemId);

  test('noPrice keeps only empty and zero prices', () => {
    expect(ids(buildOptions({ items, priceFilter: 'noPrice', sortKey: 'artikelnummer' }))).toEqual(['I-zero', 'I-empty']);
  });

  test('hasPrice keeps only positive prices', () => {
    expect(ids(buildOptions({ items, priceFilter: 'hasPrice', sortKey: 'artikelnummer' }))).toEqual(['I-cheap', 'I-pricey']);
  });

  test('sorts by price with unpriced rows last in both directions', () => {
    const asc = ids(buildOptions({ items }));
    const desc = ids(buildOptions({ items, sortDirection: 'desc' }));
    expect(asc.slice(0, 2)).toEqual(['I-cheap', 'I-pricey']);
    expect(desc.slice(0, 2)).toEqual(['I-pricey', 'I-cheap']);
    expect(new Set(asc.slice(2))).toEqual(new Set(['I-zero', 'I-empty']));
    expect(new Set(desc.slice(2))).toEqual(new Set(['I-zero', 'I-empty']));
  });
});
