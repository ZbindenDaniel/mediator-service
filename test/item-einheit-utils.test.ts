import { DEFAULT_ITEM_EINHEIT, ITEM_EINHEIT_VALUES, normalizeItemEinheit } from '../models';

describe('normalizeItemEinheit', () => {
  test('returns provided Einheit when already valid', () => {
    const result = normalizeItemEinheit('Stk');
    expect(result.value).toBe('Stk');
    expect(result.reason).toBeUndefined();
  });

  test('normalizes lowercase mix to Mix', () => {
    const result = normalizeItemEinheit('mix');
    expect(result.value).toBe('Mix');
    expect(result.reason).toBe('normalized');
  });

  test('normalizes Stück to Stk', () => {
    const result = normalizeItemEinheit('Stück');
    expect(result.value).toBe('Stk');
    expect(result.reason).toBe('normalized');
    expect(result.normalizedFrom).toBe('Stück');
  });

  test('defaults invalid strings to the fallback', () => {
    const result = normalizeItemEinheit('??');
    expect(result.value).toBe(DEFAULT_ITEM_EINHEIT);
    expect(result.reason).toBe('invalid');
  });

  test('defaults missing values to the fallback', () => {
    const result = normalizeItemEinheit(undefined);
    expect(result.value).toBe(DEFAULT_ITEM_EINHEIT);
    expect(result.reason).toBe('missing');
  });

  test('returns one of the supported Einheiten', () => {
    const validSet = new Set(ITEM_EINHEIT_VALUES);
    for (const candidate of ['Stück', 'STK', 'Mix', 'mix', '??', undefined]) {
      const { value } = normalizeItemEinheit(candidate as any);
      expect(validSet.has(value)).toBe(true);
    }
  });
});
