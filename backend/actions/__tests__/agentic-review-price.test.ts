import { applyPriceFallbackAfterReview } from '../agentic-status';
import { resetPriceLookupCache } from '../../lib/priceLookup';
import type { ItemRef } from '../../../models';

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
    const reference: ItemRef = {
      Artikel_Nummer: 'ART-123',
      Artikeltyp: 'part',
      Unterkategorien_A: 401,
    };
    const persistItemReference = jest.fn();
    const ctx = {
      getItemReference: { get: jest.fn().mockReturnValue(reference) },
      persistItemReference
    };

    applyPriceFallbackAfterReview(reference.Artikel_Nummer, ctx, logger);

    expect(persistItemReference).toHaveBeenCalledTimes(1);
    const payload = persistItemReference.mock.calls[0][0] as ItemRef;
    expect(payload.Verkaufspreis).toBe(80);
    expect(payload.Artikel_Nummer).toBe(reference.Artikel_Nummer);
  });

  it('does not override an existing Verkaufspreis', () => {
    const reference: ItemRef = {
      Artikel_Nummer: 'ART-999',
      Artikeltyp: 'part',
      Unterkategorien_A: 401,
      Verkaufspreis: 199.5
    };
    const persistItemReference = jest.fn();
    const ctx = {
      getItemReference: { get: jest.fn().mockReturnValue(reference) },
      persistItemReference
    };

    applyPriceFallbackAfterReview(reference.Artikel_Nummer, ctx, logger);

    expect(persistItemReference).not.toHaveBeenCalled();
  });
});
