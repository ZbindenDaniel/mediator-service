// import { filterAndSortItems, ItemListComputationOptions } from '../frontend/src/components/ItemListPage';
// import type { Item } from '../models';

// function buildBaseOptions(overrides: Partial<ItemListComputationOptions> = {}): ItemListComputationOptions {
//   return {
//     items: [],
//     showUnplaced: false,
//     normalizedSearch: '',
//     normalizedSubcategoryFilter: '',
//     normalizedBoxFilter: '',
//     stockFilter: 'any',
//     normalizedAgenticFilter: null,
//     sortKey: 'quality',
//     sortDirection: 'asc',
//     qualityThreshold: 1,
//     ...overrides
//   };
// }

// describe('item list quality filtering and sorting', () => {
//   const items: Item[] = [
//     { ItemUUID: 'A', UpdatedAt: new Date('2024-01-01'), BoxID: null, Quality: 2 },
//     { ItemUUID: 'B', UpdatedAt: new Date('2024-01-02'), BoxID: null, Quality: 4 },
//     { ItemUUID: 'C', UpdatedAt: new Date('2024-01-03'), BoxID: null, Quality: 3 }
//   ];

//   test('filters out items below the quality threshold', () => {
//     const options = buildBaseOptions({ items, qualityThreshold: 3 });

//     const result = filterAndSortItems(options);

    expect(result.map((item) => item.summary.representativeItemId)).toEqual(['C', 'B']);
  });

//   test('sorts by quality when requested', () => {
//     const asc = filterAndSortItems(buildBaseOptions({ items }));
//     const desc = filterAndSortItems(buildBaseOptions({ items, sortDirection: 'desc' }));

    expect(asc.map((item) => item.summary.representativeItemId)).toEqual(['A', 'C', 'B']);
    expect(desc.map((item) => item.summary.representativeItemId)).toEqual(['B', 'C', 'A']);
  });
});
