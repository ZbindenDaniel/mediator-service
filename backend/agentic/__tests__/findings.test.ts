import { buildFindings, hasBlockingFindings, isAutoApprovable } from '../findings';
import type { StandardsContract } from '../../../models/agentic-findings';

const standards: StandardsContract = {
  version: 1,
  bannedPhrases: [
    {
      id: 'warranty-clause',
      pattern: 'mit einer Garantie von',
      message: 'Garantie-Formulierung entfernen.',
      fields: ['Artikelbeschreibung', 'Kurzbeschreibung'],
      severity: 'warn'
    },
    {
      id: 'marketing',
      pattern: 'jetzt kaufen',
      message: 'Call-to-Action entfernen.',
      severity: 'info'
    }
  ]
};

describe('buildFindings — deterministic review findings', () => {
  it('flags a banned phrase in a scoped text field, case-insensitively', () => {
    const findings = buildFindings(
      { texts: { Artikelbeschreibung: 'Laptop MIT EINER GARANTIE VON 24 Monaten.' } },
      standards
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'banned_phrase',
      ruleId: 'warranty-clause',
      field: 'Artikelbeschreibung',
      ask: 'fix',
      severity: 'warn'
    });
    // Evidence preserves the matched text as it appeared.
    expect(findings[0].evidence).toBe('MIT EINER GARANTIE VON');
  });

  it('does not apply a field-scoped rule to an out-of-scope field', () => {
    const findings = buildFindings(
      { texts: { Langtext: 'Prozessor mit einer Garantie von 24 Monaten' } },
      standards
    );
    // warranty-clause is scoped to description fields only; the marketing rule has no scope but no match.
    expect(findings).toHaveLength(0);
  });

  it('applies an unscoped rule to any provided text field', () => {
    const findings = buildFindings({ texts: { Kurzbeschreibung: 'Super Angebot — jetzt kaufen!' } }, standards);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'marketing', severity: 'info', field: 'Kurzbeschreibung' });
  });

  it('emits a blocking finding for each missing required field', () => {
    const findings = buildFindings({ missingRequired: ['Prozessor', 'RAM'] }, standards);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.type === 'missing_required' && f.severity === 'block' && f.ask === 'fix')).toBe(true);
    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it('emits a choose-finding for an intake conflict with both candidate values', () => {
    const findings = buildFindings(
      { ambiguousFields: { Prozessor: { itemValue: 'i7-8550U', intakeValue: 'i5-8350U' } } },
      standards
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'intake_conflict',
      field: 'Prozessor',
      ask: 'choose',
      evidence: 'i5-8350U',
      suggestion: 'i5-8350U'
    });
    expect(findings[0].message).toContain('i5-8350U');
    expect(findings[0].message).toContain('i7-8550U');
  });

  it('orders findings worst-first (block → warn → info), stable within a band', () => {
    const findings = buildFindings(
      {
        texts: { Artikelbeschreibung: 'mit einer Garantie von 2 Jahren, jetzt kaufen' },
        missingRequired: ['RAM'],
        ambiguousFields: { Prozessor: { itemValue: 'i7', intakeValue: 'i5' } }
      },
      standards
    );
    expect(findings.map((f) => f.severity)).toEqual(['block', 'warn', 'warn', 'info']);
    // block = missing_required, then intake_conflict + banned(warn) warranty, then info banned marketing.
    expect(findings[0].type).toBe('missing_required');
    expect(findings[findings.length - 1].ruleId).toBe('marketing');
  });

  it('isAutoApprovable: clean (no findings) or info-only ⇒ true; any block/warn ⇒ false', () => {
    expect(isAutoApprovable([])).toBe(true);
    expect(isAutoApprovable([{ type: 'banned_phrase', severity: 'info', field: 'Kurzbeschreibung', message: 'x', ask: 'fix' }])).toBe(true);
    expect(isAutoApprovable([{ type: 'missing_required', severity: 'block', field: 'Prozessor', message: 'x', ask: 'fix' }])).toBe(false);
    expect(isAutoApprovable([{ type: 'banned_phrase', severity: 'warn', field: 'Artikelbeschreibung', message: 'x', ask: 'fix' }])).toBe(false);
  });

  it('is a no-op when there are no rules and no gaps', () => {
    expect(buildFindings({ texts: { Artikelbeschreibung: 'Sauberer Text' } }, null)).toEqual([]);
    expect(buildFindings({}, standards)).toEqual([]);
  });

  it('never throws on a malformed regex rule', () => {
    const bad: StandardsContract = { version: 1, bannedPhrases: [{ id: 'bad', pattern: '([', regex: true, message: 'x' }] };
    expect(() => buildFindings({ texts: { Artikelbeschreibung: 'anything (' } }, bad)).not.toThrow();
    expect(buildFindings({ texts: { Artikelbeschreibung: 'anything (' } }, bad)).toEqual([]);
  });
});
