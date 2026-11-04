import { canonicalizeSpecValue, canonicalizeSpecValuesRecord, normalizeSpecValueFormat } from '../../../models/spec-contract';

describe('normalizeSpecValueFormat — deterministic unit/number unification (L11)', () => {
  it('unifies the Zoll variants onto one form', () => {
    for (const v of ['3.5 Zoll', '3,5 Zoll', '3.5-Zoll', '3.5Zoll', '3,5zoll', '3.5  zoll']) {
      expect(normalizeSpecValueFormat(v)).toBe('3.5 Zoll');
    }
  });

  it('normalizes common glued/cased units', () => {
    expect(normalizeSpecValueFormat('8GB')).toBe('8 GB');
    expect(normalizeSpecValueFormat('256gb')).toBe('256 GB');
    expect(normalizeSpecValueFormat('2.4ghz')).toBe('2.4 GHz');
    expect(normalizeSpecValueFormat('7200rpm')).toBe('7200 rpm');
  });

  it('is idempotent', () => {
    expect(normalizeSpecValueFormat('3.5 Zoll')).toBe('3.5 Zoll');
    expect(normalizeSpecValueFormat(normalizeSpecValueFormat('3,5-zoll'))).toBe('3.5 Zoll');
  });

  it('leaves model numbers, OS names and port lists untouched (no false unit match)', () => {
    expect(normalizeSpecValueFormat('A514-51')).toBe('A514-51');
    expect(normalizeSpecValueFormat('Core i5-8250U')).toBe('Core i5-8250U');
    expect(normalizeSpecValueFormat('ICP6/56/77')).toBe('ICP6/56/77');
    expect(normalizeSpecValueFormat('Windows 10, Office 2019')).toBe('Windows 10, Office 2019');
    expect(normalizeSpecValueFormat('1x DisplayPort, 2x USB')).toBe('1x DisplayPort, 2x USB');
  });
});

describe('canonicalizeSpecValue — lever L11 (controlled spec values)', () => {
  it('folds known variants onto the canonical value (case/space-insensitive)', () => {
    expect(canonicalizeSpecValue('Anschlüsse', 'DP')).toBe('DisplayPort');
    expect(canonicalizeSpecValue('Anschlüsse', 'Display Port')).toBe('DisplayPort');
    expect(canonicalizeSpecValue('Anschlüsse', 'displayport')).toBe('DisplayPort');
    expect(canonicalizeSpecValue('anschlüsse', '  DP ')).toBe('DisplayPort'); // field key also case-insensitive
  });

  it('is idempotent — a canonical value maps to itself', () => {
    expect(canonicalizeSpecValue('Anschlüsse', 'DisplayPort')).toBe('DisplayPort');
  });

  it('leaves unknown fields and unknown values unchanged (whole-value only)', () => {
    expect(canonicalizeSpecValue('Prozessor', 'Intel i5')).toBe('Intel i5'); // no vocabulary for this field
    expect(canonicalizeSpecValue('Anschlüsse', '1x DisplayPort, 2x USB')).toBe('1x DisplayPort, 2x USB'); // compound — deferred
    expect(canonicalizeSpecValue('Speichertyp', 'Solid State Drive')).toBe('SSD');
  });
});

describe('canonicalizeSpecValuesRecord — applied to a Langtext record', () => {
  it('canonicalizes string values and array entries, passes the rest through', () => {
    expect(
      canonicalizeSpecValuesRecord({
        'Anschlüsse': 'DP',
        'Speichertyp': ['Solid State Drive', 'unknown'],
        'Prozessor': 'Intel i7',
        'Gewicht_kg': 1.2 // non-string untouched
      })
    ).toEqual({
      'Anschlüsse': 'DisplayPort',
      'Speichertyp': ['SSD', 'unknown'],
      'Prozessor': 'Intel i7',
      'Gewicht_kg': 1.2
    });
  });

  it('returns a new object, leaving the input untouched', () => {
    const input = { 'Anschlüsse': 'DP' };
    const out = canonicalizeSpecValuesRecord(input);
    expect(input['Anschlüsse']).toBe('DP');
    expect(out['Anschlüsse']).toBe('DisplayPort');
  });
});
