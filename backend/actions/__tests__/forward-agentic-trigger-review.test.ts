import { forwardAgenticTrigger } from '../agentic-trigger';
import { restartAgenticRun, startAgenticRun } from '../../agentic';
import type { AgenticRunTriggerPayload } from '../agentic-trigger';
import type { AgenticRunReviewMetadata } from '../../../models';

jest.mock('../../agentic', () => ({
  startAgenticRun: jest
    .fn()
    .mockResolvedValue({ queued: true, created: true, agentic: null }),
  restartAgenticRun: jest
    .fn()
    .mockResolvedValue({ queued: true, created: true, agentic: null })
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

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;

    expect(mockedStartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expectedReview
      }),
      expect.any(Object)
    );
  });

  it('passes through comprehensive review metadata unchanged when valid', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Full review',
      artikelNummer: 'item-full-review',
      review: {
        decision: 'reject',
        notes: 'needs work',
        reviewedBy: 'bob',
        information_present: true,
        missing_spec: ['size'],
        unneeded_spec: ['colour'],
        bad_format: 'typo',
        wrong_information: 'price',
        wrong_physical_dimensions: 'weight'
      } as unknown as AgenticRunReviewMetadata
    };

    await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: { logger } as any
    });

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;

    expect(mockedStartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expect.objectContaining({
          decision: 'reject',
          notes: 'needs work',
          reviewedBy: 'bob',
          information_present: true,
          missing_spec: ['size']
        })
      }),
      expect.any(Object)
    );
  });

  it('queues a new run and returns agentic info', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;

    const fakeRun = { Artikel_Nummer: '1234', Status: 'queued' };
    mockedStartAgenticRun.mockResolvedValueOnce({
      queued: true,
      created: true,
      agentic: fakeRun as any,
      reason: null as any
    });

    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'New run',
      artikelNummer: '1234'
    };

    const result = await forwardAgenticTrigger(payload, {
      context: 'unit-test',
      logger,
      service: { logger } as any
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ agentic: fakeRun });
  });

  it('handles agentic start errors by propagating the rejection', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    mockedStartAgenticRun.mockRejectedValueOnce(new Error('start failure'));

    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Oops',
      artikelNummer: 'bad'
    };

    await expect(
      forwardAgenticTrigger(payload, {
        context: 'unit-test',
        logger,
        service: { logger } as any
      })
    ).rejects.toThrow('start failure');
  });

  it('restarts existing runs for bulk trigger context when start declines as already-exists', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    const mockedRestartAgenticRun =
      restartAgenticRun as jest.MockedFunction<typeof restartAgenticRun>;
    mockedStartAgenticRun.mockResolvedValueOnce({
      queued: false,
      created: false,
      agentic: null,
      reason: 'already-exists'
    });

    const payload: AgenticRunTriggerPayload = {
      artikelbeschreibung: 'Existing bulk run',
      artikelNummer: 'item-bulk-existing'
    };

    const result = await forwardAgenticTrigger(payload, {
      context: 'item-list-bulk',
      logger,
      service: { logger } as any
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect(mockedRestartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-bulk-existing',
        context: 'item-list-bulk',
        searchQuery: 'Existing bulk run'
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

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    expect(mockedStartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'alice'
      }),
      expect.any(Object)
    );
  });

  it('restarts existing terminal runs outside bulk context when status is failed', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    const mockedRestartAgenticRun =
      restartAgenticRun as jest.MockedFunction<typeof restartAgenticRun>;
    const existingRun = {
      Artikel_Nummer: '19290',
      SearchQuery: 'existing failed query',
      Status: 'failed'
    };
    const restartedRun = {
      ...existingRun,
      Status: 'queued'
    };

    mockedStartAgenticRun.mockResolvedValueOnce({
      queued: false,
      created: false,
      agentic: existingRun as any,
      reason: 'already-exists'
    });
    mockedRestartAgenticRun.mockResolvedValueOnce({
      queued: true,
      created: true,
      agentic: restartedRun as any,
      reason: null as any
    });

    const result = await forwardAgenticTrigger(
      {
        artikelbeschreibung: 'Restart terminal run',
        artikelNummer: '19290'
      },
      {
        context: 'item detail start',
        logger,
        service: { logger } as any
      }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ agentic: restartedRun });
    expect(mockedRestartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: '19290',
        context: 'item detail start',
        searchQuery: 'Restart terminal run'
      }),
      expect.any(Object)
    );
  });

  it('returns success with canonical run when a run already exists outside bulk context', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const mockedStartAgenticRun =
      startAgenticRun as jest.MockedFunction<typeof startAgenticRun>;
    const existingRun = {
      Artikel_Nummer: '19290',
      SearchQuery: 'test',
      Status: 'running'
    };
    mockedStartAgenticRun.mockResolvedValueOnce({
      queued: false,
      created: false,
      agentic: existingRun as any,
      reason: 'already-exists'
    });

    const result = await forwardAgenticTrigger(
      {
        artikelbeschreibung: 'Existing run should be returned',
        artikelNummer: '19290'
      },
      {
        context: 'item detail start',
        logger,
        service: { logger } as any
      }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ agentic: existingRun });
    expect(logger.info).toHaveBeenCalledWith(
      '[agentic-trigger] Existing active agentic run detected; returning canonical run',
      expect.objectContaining({ context: 'item detail start', artikelNummer: '19290' })
    );
  });
});
