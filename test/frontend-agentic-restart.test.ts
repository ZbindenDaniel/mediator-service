import { buildAgenticRestartRequestPayload } from '../frontend/src/components/ItemDetail';

describe('buildAgenticRestartRequestPayload', () => {
  test('includes normalized review metadata when provided', () => {
    const payload = buildAgenticRestartRequestPayload({
      actor: '  Alice  ',
      search: '  Query  ',
      reviewDecision: 'Approved',
      reviewNotes: '  Looks great  ',
      reviewedBy: '  Bob  '
    });

    expect(payload).toEqual({
      actor: 'Alice',
      search: 'Query',
      review: {
        decision: 'approved',
        notes: 'Looks great',
        reviewedBy: 'Bob'
      }
    });
  });

  test('omits review property when metadata is empty', () => {
    const payload = buildAgenticRestartRequestPayload({ actor: 'Tester', search: null });

    expect(payload).toEqual({ actor: 'Tester', search: '' });
  });
});
