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

  it('ignores duplicate start attempts when an active run already exists', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Already running',
      artikelNummer: 'item-running'
    };

    const result = await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: {
        logger,
        getAgenticRun: {
          get: jest.fn().mockReturnValue({ Status: 'running' })
        }
      } as any
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: {
        status: 'ignored',
        message: 'Agentic run already in progress',
        reason: 'run-already-in-progress'
      },
      rawBody: null
    });
    expect(startAgenticRun).not.toHaveBeenCalled();
  });

  it('returns a state conflict response when preflight state lookup fails', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Conflict run',
      artikelNummer: 'item-conflict'
    };

    const result = await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: {
        logger,
        getAgenticRun: {
          get: jest.fn(() => {
            throw new Error('db unavailable');
          })
        }
      } as any
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: {
        status: 'error',
        message: 'Unable to validate current run state before start',
        reason: 'run-state-conflict'
      },
      rawBody: null
    });
    expect(startAgenticRun).not.toHaveBeenCalled();
  });
});
