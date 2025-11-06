import { forwardAgenticTrigger } from '../agentic-trigger';
import { startAgenticRun } from '../../agentic';
import type { AgenticRunReviewMetadata } from '../../../models';

jest.mock('../../agentic', () => ({
  startAgenticRun: jest.fn().mockResolvedValue({ queued: true, agentic: null })
}));

describe('forwardAgenticTrigger review metadata', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes optional review metadata fields to string or null', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    await forwardAgenticTrigger(
      {
        artikelbeschreibung: 'Review Artikel',
        itemId: 'item-review',
        review: {
          decision: '  approve  ',
          notes: undefined,
          reviewedBy: '   '
        }
      },
      {
        context: 'unit-test',
        logger,
        service: { logger } as any
      }
    );

    const expectedReview: AgenticRunReviewMetadata = {
      decision: 'approve',
      notes: null,
      reviewedBy: null
    };

    const mockedStartAgenticRun = startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;

    expect(mockedStartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expectedReview
      }),
      expect.any(Object)
    );
  });
});
