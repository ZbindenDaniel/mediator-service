import { resolveCategoryLabelToCode } from '../backend/lib/categoryLabelLookup';

describe('resolveCategoryLabelToCode', () => {
  test('translates Hauptkategorie labels regardless of separators', () => {
    const expected = 20;
    expect(resolveCategoryLabelToCode('Laptop und Zubehör', 'haupt')).toBe(expected);
    expect(resolveCategoryLabelToCode(' laptop-und-zubehör ', 'haupt')).toBe(expected);
    expect(resolveCategoryLabelToCode('LAPTOP_UND_ZUBEHÖR', 'haupt')).toBe(expected);
  });

  test('translates Unterkategorie labels with diacritics removed', () => {
    expect(resolveCategoryLabelToCode('Kühlkörper', 'unter')).toBe(1402);
  });

  test('returns undefined for unknown labels', () => {
    expect(resolveCategoryLabelToCode('unknown-category', 'haupt')).toBeUndefined();
  });
});
