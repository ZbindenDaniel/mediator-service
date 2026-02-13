import { forwardAgenticTrigger } from '../agentic-trigger';
import { startAgenticRun } from '../../agentic';
import type { AgenticRunTriggerPayload } from '../agentic-trigger';
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

    // TODO(agent): verify agentic trigger payloads use artikelNummer identifiers.
    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Review Artikel',
      artikelNummer: 'item-review',
      review: {
        decision: '  approve  ',
        notes: undefined,
        reviewedBy: '   '
      }
    };

    await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: { logger } as any
    });

    const expectedReview: AgenticRunReviewMetadata = {
      decision: 'approve',
      information_present: null,
      missing_spec: [],
      unneeded_spec: [],
      bad_format: null,
      wrong_information: null,
      wrong_physical_dimensions: null,
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

  it('forwards actor to agentic start for auditing', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // TODO(agent): verify agentic trigger payloads use artikelNummer identifiers.
    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Actor Artikel',
      artikelNummer: 'item-audit',
      actor: 'alice'
    };

    await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: { logger } as any
    });

    const mockedStartAgenticRun = startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    expect(mockedStartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'alice'
      }),
      expect.any(Object)
    );
  });
});
