import { normalizeAgenticStatusUpdate } from '../index';

describe('normalizeAgenticStatusUpdate', () => {
  test('fills missing SQL binding flags and search links payload', () => {
    const normalized = normalizeAgenticStatusUpdate({
      Artikel_Nummer: '019166',
      Status: 'queued',
      LastModified: '2024-01-01T00:00:00.000Z'
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        ReviewedByIsSet: 0,
        LastReviewDecisionIsSet: 0,
        LastReviewNotesIsSet: 0,
        RetryCountIsSet: 0,
        NextRetryAtIsSet: 0,
        LastErrorIsSet: 0,
        LastAttemptAtIsSet: 0,
        LastSearchLinksJsonIsSet: 0,
        LastSearchLinksJson: null
      })
    );
  });
});
