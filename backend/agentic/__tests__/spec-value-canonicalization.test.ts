import { canonicalizeSpecValue, canonicalizeSpecValuesRecord } from '../../../models/spec-contract';

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
