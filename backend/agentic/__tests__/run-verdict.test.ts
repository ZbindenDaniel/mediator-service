import { composeRunVerdict } from '../run-verdict';
import type { Finding } from '../../../models/agentic-findings';
import type { DataQualityGrade } from '../../../models/data-quality';

const grade = (g: number, label: string): DataQualityGrade => ({
  score: g / 5,
  grade: g,
  label,
  capped: false,
  components: { conformance: 1, completeness: 1, freshness: 1 }
});

const missing = (field: string): Finding => ({
  type: 'missing_required',
  severity: 'block',
  field,
  message: `${field} fehlt`,
  ask: 'fix'
});

const bannedWarn = (): Finding => ({
  type: 'banned_phrase',
  severity: 'warn',
  field: 'Artikelbeschreibung',
  message: 'Marketingfloskel',
  ask: 'fix'
});

describe('composeRunVerdict', () => {
  it('auto-approved + clean → prefix, grade, "keine offenen Punkte"', () => {
    expect(composeRunVerdict({ status: 'auto_approved', findings: [], dataQuality: grade(5, 'Vollständig') }))
      .toBe('Auto-freigegeben · Datenqualität 5/5 (Vollständig) · keine offenen Punkte');
  });

  it('review + missing required → names the fields (singular vs plural grammar)', () => {
    expect(composeRunVerdict({ status: 'review', findings: [missing('Speicher')], dataQuality: grade(2, 'Lückenhaft') }))
      .toBe('Review nötig · Datenqualität 2/5 (Lückenhaft) · 1 Pflichtfeld fehlt (Speicher)');
    expect(composeRunVerdict({ status: 'review', findings: [missing('Speicher'), missing('Speichertyp')], dataQuality: grade(2, 'Lückenhaft') }))
      .toBe('Review nötig · Datenqualität 2/5 (Lückenhaft) · 2 Pflichtfelder fehlen (Speicher, Speichertyp)');
  });

  it('counts non-missing block/warn findings as "Beanstandungen" alongside missing fields', () => {
    expect(composeRunVerdict({ status: 'review', findings: [missing('Speicher'), bannedWarn()], dataQuality: grade(2, 'Lückenhaft') }))
      .toBe('Review nötig · Datenqualität 2/5 (Lückenhaft) · 1 Pflichtfeld fehlt (Speicher), 1 Beanstandung');
    expect(composeRunVerdict({ status: 'approved', findings: [bannedWarn(), bannedWarn()], dataQuality: grade(4, 'Gut') }))
      .toBe('Freigegeben · Datenqualität 4/5 (Gut) · 2 Beanstandungen');
  });

  it('truncates a long missing-field list to a few names', () => {
    const fields = ['A', 'B', 'C', 'D'].map(missing);
    expect(composeRunVerdict({ status: 'review', findings: fields, dataQuality: null }))
      .toBe('Review nötig · 4 Pflichtfelder fehlen (A, B, C …)');
  });

  it('omits the grade clause when no data-quality grade is available', () => {
    expect(composeRunVerdict({ status: 'auto_approved', findings: [], dataQuality: null }))
      .toBe('Auto-freigegeben · keine offenen Punkte');
  });

  it('lifecycle (non-content) states get the prefix only — no grade/findings clause', () => {
    expect(composeRunVerdict({ status: 'queued', findings: [missing('Speicher')], dataQuality: grade(1, 'Mangelhaft') })).toBe('Eingereiht');
    expect(composeRunVerdict({ status: 'running', findings: [], dataQuality: null })).toBe('Läuft');
    expect(composeRunVerdict({ status: 'notStarted', findings: [], dataQuality: null })).toBe('Noch kein KI-Lauf');
    expect(composeRunVerdict({ status: 'failed', findings: [], dataQuality: null })).toBe('Fehlgeschlagen');
  });

  it('normalizes alias/synonym statuses (e.g. needs_review → review)', () => {
    expect(composeRunVerdict({ status: 'needs_review', findings: [], dataQuality: grade(5, 'Vollständig') }))
      .toBe('Review nötig · Datenqualität 5/5 (Vollständig) · keine offenen Punkte');
  });
});
