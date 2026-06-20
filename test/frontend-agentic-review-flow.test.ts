import {
  buildAgenticReviewSubmissionPayload,
  type AgenticReviewInput
} from '../frontend/src/lib/agenticReviewMapping';

describe('agentic review payload contract', () => {
  test('builds review payload with all required keys in stable order', () => {
    const payload = buildAgenticReviewSubmissionPayload('Reviewer', {
      information_present: true,
      bad_format: false,
      wrong_information: true,
      wrong_physical_dimensions: false,
      missing_spec: ['Spannung', 'Material'],
      unneeded_spec: ['Interner Hinweis'],
      notes: 'Optional note',
      review_price: null,
      shop_article: null,
      reviewedBy: null
    } satisfies AgenticReviewInput);

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
      review_price: null,
      shop_article: null,
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
      'review_price',
      'shop_article',
      'reviewedBy'
    ]);
  });

  test('sets reviewedBy to actor regardless of input reviewedBy field', () => {
    const payload = buildAgenticReviewSubmissionPayload('ActorName', {
      information_present: false,
      bad_format: true,
      wrong_information: false,
      wrong_physical_dimensions: true,
      missing_spec: [],
      unneeded_spec: [],
      notes: null,
      review_price: 49.99,
      shop_article: true,
      reviewedBy: 'someone-else'
    } satisfies AgenticReviewInput);

    expect(payload.reviewedBy).toBe('ActorName');
    expect(payload.review_price).toBe(49.99);
    expect(payload.shop_article).toBe(true);
  });
});
