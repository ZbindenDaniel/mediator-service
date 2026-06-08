import { calculateCo2Impact, resetCo2ContractCache } from '../backend/lib/co2Calculator';

describe('co2 calculator', () => {
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetCo2ContractCache();
  });

  it('returns null for unknown subcategory', () => {
    const result = calculateCo2Impact({ unterkategorien: [9999] }, logger);
    expect(result).toBeNull();
  });

  it('returns null when no subcategory provided', () => {
    const result = calculateCo2Impact({}, logger);
    expect(result).toBeNull();
  });

  it('laptop quality 5 → high', () => {
    // 180 × (5/5) = 180 ≥ 150
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 5 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('high');
    expect(result!.score).toBeCloseTo(180, 1);
    expect(result!.eNewKg).toBe(180);
    expect(result!.source).toBe('category-lookup');
  });

  it('laptop quality 4 → medium', () => {
    // 180 × (4/5) = 144, 75 ≤ 144 < 150
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 4 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('medium');
    expect(result!.score).toBeCloseTo(144, 1);
  });

  it('laptop quality 3 → medium', () => {
    // 180 × (3/5) = 108
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 3 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('medium');
    expect(result!.score).toBeCloseTo(108, 1);
  });

  it('laptop quality 2 → low', () => {
    // 180 × (2/5) = 72, 25 ≤ 72 < 75
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 2 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('low');
    expect(result!.score).toBeCloseTo(72, 1);
  });

  it('laptop quality 1 → low', () => {
    // 180 × (1/5) = 36
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 1 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('low');
    expect(result!.score).toBeCloseTo(36, 1);
  });

  it('server quality 5 → high', () => {
    // 1200 × (5/5) = 1200
    const result = calculateCo2Impact({ unterkategorien: [103], quality: 5 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('high');
    expect(result!.eNewKg).toBe(1200);
  });

  it('monitor quality 5 → low', () => {
    // 66 × (5/5) = 66, 25 ≤ 66 < 75
    const result = calculateCo2Impact({ unterkategorien: [401], quality: 5 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('low');
    expect(result!.score).toBeCloseTo(66, 1);
  });

  it('network card quality 2 → irrelevant', () => {
    // 30 × (2/5) = 12 < 25
    const result = calculateCo2Impact({ unterkategorien: [702], quality: 2 }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('irrelevant');
    expect(result!.score).toBeCloseTo(12, 1);
  });

  it('defaults to quality 3 when quality is null', () => {
    // laptop: 180 × (3/5) = 108 → medium
    const result = calculateCo2Impact({ unterkategorien: [201], quality: null }, logger);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('medium');
    expect(result!.score).toBeCloseTo(108, 1);
  });

  it('result has no age, lFactor, or rReuse fields', () => {
    const result = calculateCo2Impact({ unterkategorien: [201], quality: 4 }, logger);
    expect(result).not.toBeNull();
    expect((result as any).ageYears).toBeUndefined();
    expect((result as any).lFactor).toBeUndefined();
    expect((result as any).rReuse).toBeUndefined();
    expect((result as any).co2SavedKg).toBeUndefined();
  });

  it('caches the contract between calls', () => {
    calculateCo2Impact({ unterkategorien: [201] }, logger);
    calculateCo2Impact({ unterkategorien: [201] }, logger);
    // debug log (contract loaded) should fire only once
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('resets cache after resetCo2ContractCache', () => {
    calculateCo2Impact({ unterkategorien: [201] }, logger);
    resetCo2ContractCache();
    calculateCo2Impact({ unterkategorien: [201] }, logger);
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });
});
