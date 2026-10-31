import { computeDataQualityGrade, computeReferenceDataQuality, DATA_QUALITY_WEIGHTS } from '../data-quality';
import type { Finding } from '../../../models/agentic-findings';

const clean = { findings: [] as Finding[], requiredTotal: 0, requiredMissing: 0, desiredTotal: 0, desiredMissing: 0, freshness: 'current' as const };

function finding(severity: Finding['severity'], type: Finding['type'] = 'banned_phrase'): Finding {
  return { type, severity, field: 'Artikelbeschreibung', message: 'x', ask: 'fix' };
}

describe('computeDataQualityGrade — the tunable formula', () => {
  it('a clean, complete, current item scores 1.0 → grade 5', () => {
    const g = computeDataQualityGrade(clean);
    expect(g.score).toBeCloseTo(1, 5);
    expect(g.grade).toBe(5);
    expect(g.capped).toBe(false);
  });

  it('warn/info conformance findings lower the score without capping', () => {
    const g = computeDataQualityGrade({ ...clean, findings: [finding('warn'), finding('info')] });
    // conformance = 1 - 0.25 - 0.05 = 0.70; score = 0.45*0.70 + 0.40 + 0.15 = 0.865
    expect(g.components.conformance).toBeCloseTo(0.7, 5);
    expect(g.capped).toBe(false);
    expect(g.score).toBeCloseTo(0.865, 3);
  });

  it('any block finding caps the score at blockCap (knock-out)', () => {
    const g = computeDataQualityGrade({ ...clean, findings: [finding('block')] });
    expect(g.capped).toBe(true);
    expect(g.score).toBeCloseTo(DATA_QUALITY_WEIGHTS.blockCap, 5);
    expect(g.grade).toBe(3); // 0.4 → band ≥0.4
  });

  it('missing_required findings do NOT touch conformance (they are completeness)', () => {
    const g = computeDataQualityGrade({ ...clean, findings: [finding('warn', 'missing_required')] });
    expect(g.components.conformance).toBe(1);
  });

  it('missing required fields lower completeness', () => {
    const g = computeDataQualityGrade({ ...clean, requiredTotal: 4, requiredMissing: 2, freshness: 'current' });
    // requiredCoverage 0.5 → completeness = 0.8*0.5 + 0.2*1 = 0.6
    expect(g.components.completeness).toBeCloseTo(0.6, 5);
  });

  it('stale contract version lowers freshness', () => {
    const stale = computeDataQualityGrade({ ...clean, freshness: 'stale' });
    const current = computeDataQualityGrade({ ...clean, freshness: 'current' });
    expect(stale.components.freshness).toBeLessThan(current.components.freshness);
    expect(stale.score).toBeLessThan(current.score);
  });
});

describe('computeReferenceDataQuality — ref wrapper', () => {
  it('returns null when the item has no subcategory (nothing to grade)', () => {
    expect(computeReferenceDataQuality({ Artikelbeschreibung: 'x' }, [], 1)).toBeNull();
  });

  it('returns null for a null/invalid reference', () => {
    expect(computeReferenceDataQuality(null, [], 1)).toBeNull();
    expect(computeReferenceDataQuality(undefined, [], null)).toBeNull();
  });
});
