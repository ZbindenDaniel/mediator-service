import {
  AGENTIC_REVIEW_PROMPT_SEQUENCE,
  buildAgenticReviewSubmissionPayload
} from '../frontend/src/components/ItemDetail';

describe('agentic review flow ordering and payload contract', () => {
  test('asks checklist before optional note prompt', () => {
    expect(Array.from(AGENTIC_REVIEW_PROMPT_SEQUENCE)).toEqual(['checklist', 'note']);
  });

  test('builds review payload with stable contract keys and sequence', () => {
    const payload = buildAgenticReviewSubmissionPayload('Reviewer', {
      information_present: true,
      bad_format: false,
      wrong_information: true,
      wrong_physical_dimensions: false,
      missing_spec: ['Spannung', 'Material'],
      unneeded_spec: ['Interner Hinweis'],
      notes: 'Optional note',
      reviewedBy: null
    });

    expect(payload).toEqual({
      actor: 'Reviewer',
      action: 'review',
      information_present: true,
      bad_format: false,
      wrong_information: true,
      wrong_physical_dimensions: false,
      missing_spec: ['Spannung', 'Material'],
      unneeded_spec: ['Interner Hinweis'],
      notes: 'Optional note',
      reviewedBy: 'Reviewer'
    });

    expect(Object.keys(payload)).toEqual([
      'actor',
      'action',
      'information_present',
      'bad_format',
      'wrong_information',
      'wrong_physical_dimensions',
      'missing_spec',
      'unneeded_spec',
      'notes',
      'reviewedBy'
    ]);
  });
});
