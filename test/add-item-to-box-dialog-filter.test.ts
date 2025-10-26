import type { Item } from '../models';
import {
  FILTERED_RESULTS_HIDDEN_MESSAGE,
  NO_RESULTS_MESSAGE,
  SEARCH_PROMPT_MESSAGE,
  filterSearchResults,
  getEmptyStateMessage
} from '../frontend/src/components/AddItemToBoxDialog';

function createItem(overrides: Partial<Item>): Item {
  return {
    ItemUUID: 'I-TEST',
    BoxID: null,
    UpdatedAt: new Date(),
    ...overrides
  } as Item;
}

describe('AddItemToBoxDialog filtering helpers', () => {
  test('filterSearchResults removes items that already have a box when hidePlaced is true', () => {
    const items: Item[] = [
      createItem({ ItemUUID: 'UNPLACED' }),
      createItem({ ItemUUID: 'PLACED', BoxID: 'BOX-123' })
    ];

    const filtered = filterSearchResults(items, true);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].ItemUUID).toBe('UNPLACED');
  });

  test('filterSearchResults keeps all results when hidePlaced is false', () => {
    const items: Item[] = [
      createItem({ ItemUUID: 'UNPLACED' }),
      createItem({ ItemUUID: 'PLACED', BoxID: 'BOX-123' })
    ];

    const filtered = filterSearchResults(items, false);

    expect(filtered).toHaveLength(items.length);
  });

  test('getEmptyStateMessage guides users to search before the first query', () => {
    const message = getEmptyStateMessage({
      hasSearched: false,
      totalResults: 0,
      visibleResults: 0,
      hidePlaced: true,
      hiddenResultCount: 0
    });

    expect(message).toBe(SEARCH_PROMPT_MESSAGE);
  });

  test('getEmptyStateMessage clarifies when all results are hidden by the filter', () => {
    const message = getEmptyStateMessage({
      hasSearched: true,
      totalResults: 3,
      visibleResults: 0,
      hidePlaced: true,
      hiddenResultCount: 3
    });

    expect(message).toBe(FILTERED_RESULTS_HIDDEN_MESSAGE);
  });

  test('getEmptyStateMessage reports a genuine empty result set', () => {
    const message = getEmptyStateMessage({
      hasSearched: true,
      totalResults: 0,
      visibleResults: 0,
      hidePlaced: true,
      hiddenResultCount: 0
    });

    expect(message).toBe(NO_RESULTS_MESSAGE);
  });
});
