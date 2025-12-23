import { resolvePriceByCategoryAndType, resetPriceLookupCache } from '../backend/lib/priceLookup';

describe('price lookup helper', () => {
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

  it('prefers subcategory and type matches when available', () => {
    const price = resolvePriceByCategoryAndType(
      {
        hauptkategorien: [40],
        unterkategorien: [401],
        artikeltyp: 'PART'
      },
      logger
    );

    expect(price).toBe(80);
    expect(logger.info).toHaveBeenCalledWith(
      '[price-lookup] Resolved fallback sale price',
      expect.objectContaining({
        appliedPrice: 80
      })
    );
  });

  it('falls back to type-only rows when no categories are provided', () => {
    const price = resolvePriceByCategoryAndType(
      {
        artikeltyp: 'part'
      },
      logger
    );

    expect(price).toBe(25);
  });
});
