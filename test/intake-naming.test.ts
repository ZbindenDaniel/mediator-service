import { stripLeadingVendor, composeRefName } from '../backend/lib/intake-naming';

describe('intake-naming: stripLeadingVendor', () => {
  it('strips a doubled leading vendor (the reported "HP HP …" case)', () => {
    expect(stripLeadingVendor('HP HP ProBook 470 G4', 'HP')).toBe('ProBook 470 G4');
  });

  it('strips a single leading vendor', () => {
    expect(stripLeadingVendor('HP ProBook 470 G4', 'HP')).toBe('ProBook 470 G4');
  });

  it('is idempotent when the model has no leading brand', () => {
    expect(stripLeadingVendor('ProBook 470 G4', 'HP')).toBe('ProBook 470 G4');
  });

  it('matches the vendor case-insensitively', () => {
    expect(stripLeadingVendor('hp ProBook 470 G4', 'HP')).toBe('ProBook 470 G4');
  });

  it('passes the model through when vendor is empty', () => {
    expect(stripLeadingVendor('HP ProBook', '')).toBe('HP ProBook');
    expect(stripLeadingVendor('HP ProBook', null)).toBe('HP ProBook');
  });

  it('does not eat a partial-token match (HProBook stays)', () => {
    expect(stripLeadingVendor('HProBook 470', 'HP')).toBe('HProBook 470');
  });

  it('trims surrounding whitespace', () => {
    expect(stripLeadingVendor('  HP  ProBook 470 G4 ', 'HP')).toBe('ProBook 470 G4');
  });

  it('handles null/undefined model', () => {
    expect(stripLeadingVendor(null, 'HP')).toBe('');
    expect(stripLeadingVendor(undefined, 'HP')).toBe('');
  });
});

describe('intake-naming: composeRefName', () => {
  it('carries the brand exactly once from a doubled model', () => {
    expect(composeRefName('HP', 'HP HP ProBook 470 G4')).toBe('HP ProBook 470 G4');
  });

  it('carries the brand exactly once from a clean model', () => {
    expect(composeRefName('HP', 'ProBook 470 G4')).toBe('HP ProBook 470 G4');
  });

  it('returns just the model when vendor is empty', () => {
    expect(composeRefName('', 'ProBook 470 G4')).toBe('ProBook 470 G4');
    expect(composeRefName(null, 'ProBook 470 G4')).toBe('ProBook 470 G4');
  });

  it('returns just the vendor when model is empty', () => {
    expect(composeRefName('HP', '')).toBe('HP');
    expect(composeRefName('HP', null)).toBe('HP');
  });
});
