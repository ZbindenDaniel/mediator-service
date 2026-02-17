import { resolvePricingDecision } from '../flow/item-flow-pricing';

describe('pricing decision tree', () => {
  // TODO(agentic-pricing-contract): Add transcript-level assertions once pricing stage fixtures are introduced.
  it('returns null when no usable prices are present', () => {
    const result = resolvePricingDecision({
      Verkaufspreis: null,
      confidence: 0.95,
      evidenceCount: 3
    });

    expect(result.normalizedPrice).toBeNull();
    expect(result.selectedSource).toBe('none');
  });

  it('prefers direct listing price over contradictory historical/explicit values', () => {
    const result = resolvePricingDecision({
      directListingPrice: '129,90 €',
      trustedHistoricalPrice: 89,
      Verkaufspreis: 72,
      confidence: 0.9,
      evidenceCount: 3
    });

    expect(result.normalizedPrice).toBeCloseTo(129.9);
    expect(result.selectedSource).toBe('directListingPrice');
  });

  it('treats malformed currency text as missing', () => {
    const result = resolvePricingDecision({
      directListingPrice: 'EUR --',
      trustedHistoricalPrice: null,
      confidence: 1,
      evidenceCount: 4
    });

    expect(result.normalizedPrice).toBeNull();
    expect(result.selectedSource).toBe('none');
  });

  it('suppresses non-null output when evidence/confidence thresholds are not met', () => {
    const result = resolvePricingDecision({
      trustedHistoricalPrice: 49.99,
      confidence: 0.4,
      evidenceCount: 1
    });

    expect(result.normalizedPrice).toBeNull();
    expect(result.selectedSource).toBe('trustedHistoricalPrice');
  });

  it('rejects zero unless explicitly marked as valid source value', () => {
    const withoutZeroFlag = resolvePricingDecision({
      directListingPrice: 0,
      confidence: 0.9,
      evidenceCount: 4
    });

    const withZeroFlag = resolvePricingDecision({
      directListingPrice: 0,
      zeroIsValid: true,
      confidence: 0.9,
      evidenceCount: 4
    });

    expect(withoutZeroFlag.normalizedPrice).toBeNull();
    expect(withZeroFlag.normalizedPrice).toBe(0);
    expect(withZeroFlag.selectedSource).toBe('directListingPrice');
  });
});
