import { calculateCo2Savings, resetCo2ContractCache } from '../backend/lib/co2Calculator';

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

  it('returns null for unknown subcategory with no weight', () => {
    const result = calculateCo2Savings({ unterkategorien: [9999] }, logger);
    expect(result).toBeNull();
  });

  it('returns null when no subcategory provided', () => {
    const result = calculateCo2Savings({}, logger);
    expect(result).toBeNull();
  });

  it('calculates savings for a laptop (201) aged 3 years, quality 3', () => {
    // E_new=180, R=0.85, age=3, total=8, typical=5 → remaining=5, L=min(1,5/5)=1.0
    // quality 3 → medium → O_refurb=10
    // CO2_saved = 180 × 0.85 × 1.0 − 10 = 153 − 10 = 143
    const threeYearsAgo = new Date(Date.now() - 3 * 365.25 * 24 * 3600 * 1000).toISOString();
    const result = calculateCo2Savings(
      { unterkategorien: [201], datumErfasst: threeYearsAgo, quality: 3 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.co2SavedKg).toBeCloseTo(143, 0);
    expect(result!.source).toBe('category-lookup');
    expect(result!.oRefurbKg).toBe(10);
  });

  it('calculates savings for a monitor (401) aged 4 years, quality 5', () => {
    // E_new=66, R=0.85, age=4, total=10, typical=5 → remaining=6, L=min(1,6/5)=1.0
    // quality 5 → light → O_refurb=5
    // CO2_saved = 66 × 0.85 × 1.0 − 5 = 56.1 − 5 = 51.1
    const fourYearsAgo = new Date(Date.now() - 4 * 365.25 * 24 * 3600 * 1000).toISOString();
    const result = calculateCo2Savings(
      { unterkategorien: [401], datumErfasst: fourYearsAgo, quality: 5 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.co2SavedKg).toBeCloseTo(51, 0);
    expect(result!.oRefurbKg).toBe(5);
  });

  it('calculates savings for a server (103) aged 5 years, quality 2', () => {
    // E_new=1200, R=0.85, age=5, total=8, typical=4 → remaining=3, L=min(1,3/4)=0.75
    // quality 2 → medium → O_refurb=10
    // CO2_saved = 1200 × 0.85 × 0.75 − 10 = 765 − 10 = 755
    const fiveYearsAgo = new Date(Date.now() - 5 * 365.25 * 24 * 3600 * 1000).toISOString();
    const result = calculateCo2Savings(
      { unterkategorien: [103], datumErfasst: fiveYearsAgo, quality: 2 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.co2SavedKg).toBeCloseTo(755, 0);
  });

  it('defaults to 4 year age when datumErfasst is null', () => {
    // Laptop, age=4 default, total=8, typical=5 → remaining=4, L=4/5=0.8
    // quality null → medium → O_refurb=10
    // CO2_saved = 180 × 0.85 × 0.8 − 10 = 122.4 − 10 = 112.4
    const result = calculateCo2Savings(
      { unterkategorien: [201], datumErfasst: null, quality: null },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.co2SavedKg).toBeCloseTo(112, 0);
    expect(result!.ageYears).toBe(4);
  });

  it('caps L_factor at 1.0 when item is brand new', () => {
    const now = new Date().toISOString();
    const result = calculateCo2Savings(
      { unterkategorien: [201], datumErfasst: now, quality: 4 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.lFactor).toBeLessThanOrEqual(1.0);
    // quality 4 → light → O_refurb=5
    // CO2_saved = 180 × 0.85 × 1.0 − 5 = 148
    expect(result!.co2SavedKg).toBeCloseTo(148, 0);
  });

  it('returns 0 (not negative) when device is near end of life', () => {
    // Laptop age=9 (exceeds total_achievable=8) → remaining=0, L=0
    // CO2_saved = max(0, 0 − O_refurb) = 0
    const nineYearsAgo = new Date(Date.now() - 9 * 365.25 * 24 * 3600 * 1000).toISOString();
    const result = calculateCo2Savings(
      { unterkategorien: [201], datumErfasst: nineYearsAgo, quality: 3 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.co2SavedKg).toBeGreaterThanOrEqual(0);
  });

  it('uses heavy refurb intensity for quality 1', () => {
    const result = calculateCo2Savings(
      { unterkategorien: [201], quality: 1 },
      logger
    );
    expect(result).not.toBeNull();
    expect(result!.oRefurbKg).toBe(20);
  });

  it('caches the contract between calls', () => {
    calculateCo2Savings({ unterkategorien: [201] }, logger);
    calculateCo2Savings({ unterkategorien: [201] }, logger);
    // debug log (contract loaded) should fire only once
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('resets cache after resetCo2ContractCache', () => {
    calculateCo2Savings({ unterkategorien: [201] }, logger);
    resetCo2ContractCache();
    calculateCo2Savings({ unterkategorien: [201] }, logger);
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });
});
