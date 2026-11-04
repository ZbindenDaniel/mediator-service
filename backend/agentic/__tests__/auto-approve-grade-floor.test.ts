import { gradeClearsAutoApprove } from '../flow/item-flow';
import type { DataQualityGrade } from '../../../models/data-quality';

// The default floor is 4 (AUTO_APPROVE_MIN_GRADE unset in tests).
const grade = (g: number): DataQualityGrade => ({
  score: g / 5,
  grade: g,
  label: null,
  capped: false,
  components: { conformance: 1, completeness: 1, freshness: 1 }
});

describe('gradeClearsAutoApprove — auto-approve data-quality floor', () => {
  it('a supervised run auto-approves at grade >= the floor (4), not below', () => {
    expect(gradeClearsAutoApprove(grade(5), false)).toBe(true);
    expect(gradeClearsAutoApprove(grade(4), false)).toBe(true);
    expect(gradeClearsAutoApprove(grade(3), false)).toBe(false);
    expect(gradeClearsAutoApprove(grade(2), false)).toBe(false);
  });

  it('a validate-only run (no supervisor) requires the TOP grade (5)', () => {
    expect(gradeClearsAutoApprove(grade(5), true)).toBe(true);
    expect(gradeClearsAutoApprove(grade(4), true)).toBe(false);
    expect(gradeClearsAutoApprove(grade(3), true)).toBe(false);
  });

  it('a null grade (no spec contract → quality unknown) never auto-approves', () => {
    expect(gradeClearsAutoApprove(null, false)).toBe(false);
    expect(gradeClearsAutoApprove(null, true)).toBe(false);
  });
});
