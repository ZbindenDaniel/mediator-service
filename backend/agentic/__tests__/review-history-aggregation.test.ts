import { mapReviewHistoryForAggregation } from '../index';
import type { AgenticRunReviewHistoryEntry } from '../../../models';

// TODO(agentic-review-history-tests): Extend mapping checks when review-history fields evolve.
describe('agentic review history aggregation source', () => {
  test('maps full persisted review history for aggregation consumers', () => {
    const history: AgenticRunReviewHistoryEntry[] = [
      {
        Id: 1,
        Artikel_Nummer: 'R-300',
        Status: 'rejected',
        ReviewState: 'rejected',
        ReviewDecision: 'rejected',
        ReviewNotes: 'missing dimensions',
        ReviewMetadata: JSON.stringify({
          information_present: false,
          bad_format: true,
          wrong_information: true,
          wrong_physical_dimensions: false,
          missing_spec: ['Breite', 'Höhe']
        }),
        ReviewedBy: 'reviewer-a',
        RecordedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        Id: 2,
        Artikel_Nummer: 'R-300',
        Status: 'approved',
        ReviewState: 'approved',
        ReviewDecision: 'approved',
        ReviewNotes: 'resolved after retry',
        ReviewMetadata: null,
        ReviewedBy: 'reviewer-b',
        RecordedAt: '2024-01-01T01:00:00.000Z'
      }
    ];

    const mapped = mapReviewHistoryForAggregation(history);

    expect(mapped).toHaveLength(2);
    expect(mapped).toEqual([
      expect.objectContaining({
        decision: 'rejected',
        notes: 'missing dimensions',
        reviewedBy: 'reviewer-a',
        information_present: false,
        bad_format: true,
        wrong_information: true,
        wrong_physical_dimensions: false,
        missing_spec: ['Breite', 'Höhe']
      }),
      expect.objectContaining({
        decision: 'approved',
        notes: 'resolved after retry',
        reviewedBy: 'reviewer-b',
        missing_spec: []
      })
    ]);
  });
});
