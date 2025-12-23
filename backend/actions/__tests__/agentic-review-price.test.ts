import { applyPriceFallbackAfterReview } from '../agentic-status';
import { resetPriceLookupCache } from '../../lib/priceLookup';
import type { Item } from '../../../models';

describe('agentic review price fallback', () => {
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetPriceLookupCache();
  });

  it('applies fallback sale price when an approved item lacks Verkaufspreis', () => {
    const item: Item = {
      ItemUUID: 'item-price-1',
      Artikeltyp: 'part',
      Unterkategorien_A: 401,
      BoxID: null,
      UpdatedAt: new Date('2024-01-01T00:00:00.000Z')
    };
    const persistItem = jest.fn();
    const ctx = {
      getItem: { get: jest.fn().mockReturnValue(item) },
      persistItem
    };

    applyPriceFallbackAfterReview(item.ItemUUID, ctx, logger);

    expect(persistItem).toHaveBeenCalledTimes(1);
    const payload = persistItem.mock.calls[0][0] as Item;
    expect(payload.Verkaufspreis).toBe(80);
    expect(payload.ItemUUID).toBe(item.ItemUUID);
  });

  it('does not override an existing Verkaufspreis', () => {
    const item: Item = {
      ItemUUID: 'item-price-2',
      Artikeltyp: 'part',
      Unterkategorien_A: 401,
      Verkaufspreis: 199.5,
      BoxID: null,
      UpdatedAt: new Date('2024-01-01T00:00:00.000Z')
    };
    const persistItem = jest.fn();
    const ctx = {
      getItem: { get: jest.fn().mockReturnValue(item) },
      persistItem
    };

    applyPriceFallbackAfterReview(item.ItemUUID, ctx, logger);

    expect(persistItem).not.toHaveBeenCalled();
  });
});
