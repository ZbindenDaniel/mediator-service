import { resolveInstancePrice, pricingFactorForGrade, pricingConfigFrom, DEFAULT_PRICING_CONFIG } from '../models/pricing';
import type { PricingConfig } from '../models/pricing';
import { validateContractDocument } from '../backend/contracts/validate';

describe('instance pricing (models/pricing.ts)', () => {
  test('linear grade factor: grade / 5, floored at 20 %', () => {
    expect([1, 2, 3, 4, 5].map((g) => pricingFactorForGrade(g))).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  test('unknown grade gets the 20 % floor', () => {
    expect(pricingFactorForGrade(null)).toBe(0.2);
    expect(resolveInstancePrice({ basePrice: 500, grade: null })).toEqual({ price: 100, source: 'formula', factor: 0.2 });
  });

  test('base CHF 500 → 100/200/300/400/500', () => {
    const prices = [1, 2, 3, 4, 5].map((grade) => resolveInstancePrice({ basePrice: 500, grade }).price);
    expect(prices).toEqual([100, 200, 300, 400, 500]);
  });

  test('rounds to CHF 5, keeps an exact like-new base price', () => {
    expect(resolveInstancePrice({ basePrice: 349, grade: 3 }).price).toBe(210); // 209.4
    expect(resolveInstancePrice({ basePrice: 349, grade: 5 }).price).toBe(349);
  });

  test('a cheap item does not round to 0 and never exceeds the base', () => {
    expect(resolveInstancePrice({ basePrice: 8, grade: 1 }).price).toBe(1.6);
    expect(resolveInstancePrice({ basePrice: 6, grade: 4 }).price).toBe(5);
  });

  test('override wins; 0 means no override', () => {
    expect(resolveInstancePrice({ basePrice: 500, grade: 2, override: 333 })).toEqual({ price: 333, source: 'override', factor: null });
    expect(resolveInstancePrice({ basePrice: 500, grade: 2, override: 0 }).source).toBe('formula');
  });

  test('no base price → no price (the shop catches it)', () => {
    expect(resolveInstancePrice({ basePrice: null, grade: 5 })).toEqual({ price: null, source: 'none', factor: null });
    expect(resolveInstancePrice({ basePrice: 0, grade: 5 }).price).toBeNull();
  });

  test('config comes from the first contract that has one', () => {
    const custom: PricingConfig = { model: 'linear-grade', minFactor: 0.3, rounding: { step: 10, mode: 'up' } };
    expect(pricingConfigFrom([null, { pricing: custom }])).toBe(custom);
    expect(pricingConfigFrom([{}])).toBe(DEFAULT_PRICING_CONFIG);
    expect(resolveInstancePrice({ basePrice: 500, grade: 3, config: custom }).price).toBe(300);
    expect(resolveInstancePrice({ basePrice: 101, grade: 1, config: custom }).price).toBe(40); // 30.3 → up
  });

  test('validator rejects a broken pricing block', () => {
    const bad = validateContractDocument('quality', { questions: [], pricing: { model: 'x', rounding: { step: -1 } } }, 'general');
    expect(bad.join('\n')).toMatch(/pricing/);
    const good = validateContractDocument('quality', { questions: [], pricing: DEFAULT_PRICING_CONFIG }, 'general');
    expect(good).toEqual([]);
  });
});
