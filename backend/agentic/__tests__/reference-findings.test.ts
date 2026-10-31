import { computeReferenceFindings } from '../reference-findings';

// Uses the real contracts/standards.json (seeded with "mit einer Garantie von" etc.), exercising the
// on-read path: findings reflect the reference's CURRENT content, not a run's frozen output.
describe('computeReferenceFindings — on-read findings from current content', () => {
  it('flags a seeded banned phrase in the current Artikelbeschreibung', () => {
    const findings = computeReferenceFindings({
      Artikelbeschreibung: 'Laptop mit einer Garantie von 24 Monaten.',
      Kurzbeschreibung: '',
      Langtext: null
    });
    const banned = findings.filter((f) => f.type === 'banned_phrase');
    expect(banned.length).toBeGreaterThan(0);
    expect(banned.some((f) => f.ruleId === 'warranty-clause' && f.field === 'Artikelbeschreibung')).toBe(true);
  });

  it('flags a seeded (description-scoped) phrase in the Kurzbeschreibung', () => {
    const findings = computeReferenceFindings({
      Artikelbeschreibung: 'Sauber',
      Kurzbeschreibung: 'Netzteil im Lieferumfang enthalten.',
      Langtext: null
    });
    expect(findings.some((f) => f.ruleId === 'scope-of-delivery' && f.field === 'Kurzbeschreibung')).toBe(true);
  });

  it('does NOT apply a description-scoped rule to Langtext spec values', () => {
    const findings = computeReferenceFindings({
      Artikelbeschreibung: 'Sauber',
      Langtext: JSON.stringify({ Zustand: 'im Lieferumfang enthalten: Netzteil' })
    });
    // The seeded rules are scoped to Artikelbeschreibung/Kurzbeschreibung, so a Langtext value is untouched.
    expect(findings.some((f) => f.field === 'Zustand')).toBe(false);
  });

  it('returns nothing for clean content and no subcategory', () => {
    expect(computeReferenceFindings({ Artikelbeschreibung: 'Lenovo ThinkPad X1', Langtext: null })).toEqual([]);
  });

  it('is a no-op for a null/invalid reference', () => {
    expect(computeReferenceFindings(null)).toEqual([]);
    expect(computeReferenceFindings(undefined)).toEqual([]);
  });
});
