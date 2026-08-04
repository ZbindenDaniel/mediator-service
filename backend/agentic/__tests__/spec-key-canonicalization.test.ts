import {
  canonicalizeSpecKey,
  canonicalizeSpecKeyRecord,
  checkSpecGap,
  type SpecContract,
} from '../../../models/spec-contract';

describe('spec key canonicalization', () => {
  it('resolves known variants to the canonical contract key (case-insensitive)', () => {
    expect(canonicalizeSpecKey('CPU')).toBe('Prozessor');
    expect(canonicalizeSpecKey('cpu')).toBe('Prozessor');
    expect(canonicalizeSpecKey('Arbeitsspeicher')).toBe('RAM');
    expect(canonicalizeSpecKey('Prozessor')).toBe('Prozessor');
    // Unknown keys pass through unchanged.
    expect(canonicalizeSpecKey('Gewicht')).toBe('Gewicht');
  });

  it('folds a variant value onto the canonical key and drops the variant', () => {
    const result = canonicalizeSpecKeyRecord({ CPU: 'Intel i5-8250U', Gewicht: '1.2 kg' });
    expect(result).toEqual({ Prozessor: 'Intel i5-8250U', Gewicht: '1.2 kg' });
    expect(result).not.toHaveProperty('CPU');
  });

  it('keeps the explicit canonical value when both canonical and variant are present', () => {
    const result = canonicalizeSpecKeyRecord({
      Prozessor: 'Intel i7',
      CPU: 'Intel i5',
    });
    expect(result.Prozessor).toBe('Intel i7');
    expect(result).not.toHaveProperty('CPU');
  });

  it('does not overwrite a real canonical value with an empty variant', () => {
    const result = canonicalizeSpecKeyRecord({ Prozessor: 'Intel i7', CPU: '' });
    expect(result.Prozessor).toBe('Intel i7');
  });

  it('adopts the variant value when the canonical key is present but empty', () => {
    const result = canonicalizeSpecKeyRecord({ Prozessor: '', CPU: 'Intel i5' });
    expect(result.Prozessor).toBe('Intel i5');
    expect(result).not.toHaveProperty('CPU');
  });

  it('reports a canonical field as present when only a variant key holds the value', () => {
    const contract: SpecContract = {
      version: 1,
      fields: [
        { key: 'Prozessor', required: true, description: 'CPU model and speed' },
        { key: 'RAM', required: true, description: 'Memory in GB' },
      ],
    };
    const gap = checkSpecGap(contract, { CPU: 'Intel i5', RAM: '16 GB' });
    expect(gap.missingRequired).toEqual([]);
    expect(gap.presentFields).toEqual(expect.arrayContaining(['Prozessor', 'RAM']));
  });
});
