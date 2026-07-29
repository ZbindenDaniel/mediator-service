import { resolveAgenticApproval, filterErpItemsByApproval } from '../../actions/export-items';

describe('auto_approved ERP eligibility', () => {
  it('treats auto_approved ReviewState as approved for export', () => {
    expect(resolveAgenticApproval({ AgenticReviewState: 'auto_approved' }).approved).toBe(true);
    expect(resolveAgenticApproval({ AgenticReviewState: 'approved' }).approved).toBe(true);
    expect(resolveAgenticApproval({ AgenticReviewState: 'pending' }).approved).toBe(false);
  });

  it('treats auto_approved Status as approved when ReviewState is absent (legacy rows)', () => {
    expect(resolveAgenticApproval({ AgenticStatus: 'auto_approved' }).approved).toBe(true);
    expect(resolveAgenticApproval({ AgenticStatus: 'review' }).approved).toBe(false);
  });

  it('includes auto_approved items in the ERP export set and suppresses unreviewed ones', () => {
    const { approved, suppressed } = filterErpItemsByApproval(
      [
        { Artikel_Nummer: 'A-1', AgenticReviewState: 'auto_approved' },
        { Artikel_Nummer: 'A-2', AgenticReviewState: 'approved' },
        { Artikel_Nummer: 'A-3', AgenticReviewState: 'pending' },
      ],
      { requireApproval: true, logger: { error() {}, info() {}, warn() {} } }
    );
    expect(approved.map((i) => i.Artikel_Nummer)).toEqual(['A-1', 'A-2']);
    expect(suppressed.map((i) => i.Artikel_Nummer)).toEqual(['A-3']);
  });
});
