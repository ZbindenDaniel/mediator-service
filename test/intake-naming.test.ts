import { collapseRepeatedTokens } from '../backend/lib/intake-naming';

describe('intake-naming: collapseRepeatedTokens', () => {
  it('collapses the reported triple brand to one', () => {
    expect(collapseRepeatedTokens('HP HP HP ProBook 470 G4')).toBe('HP ProBook 470 G4');
  });

  it('collapses a doubled brand to one', () => {
    expect(collapseRepeatedTokens('HP HP ProBook 470 G4')).toBe('HP ProBook 470 G4');
  });

  it('leaves a clean model unchanged', () => {
    expect(collapseRepeatedTokens('HP ProBook 470 G4')).toBe('HP ProBook 470 G4');
  });

  it('does not add or strip a brand — only removes repeats', () => {
    expect(collapseRepeatedTokens('ProBook 470 G4')).toBe('ProBook 470 G4');
  });

  it('matches duplicates case-insensitively but keeps first casing', () => {
    expect(collapseRepeatedTokens('HP hp ProBook')).toBe('HP ProBook');
  });

  it('normalizes surrounding/internal whitespace', () => {
    expect(collapseRepeatedTokens('  HP   HP  ProBook 470 G4 ')).toBe('HP ProBook 470 G4');
  });

  it('only collapses consecutive repeats, not distant ones', () => {
    expect(collapseRepeatedTokens('HP ProBook HP')).toBe('HP ProBook HP');
  });

  it('handles empty/null/undefined', () => {
    expect(collapseRepeatedTokens('')).toBe('');
    expect(collapseRepeatedTokens(null)).toBe('');
    expect(collapseRepeatedTokens(undefined)).toBe('');
  });
});
