import {
  AGENTIC_RUN_STATUS_REVIEW,
  type AgenticRun,
  type AgenticRunReviewMetadata,
  type AgenticRunRestartInput
} from '../../../models';
import { restartAgenticRun } from '../index';

function createDeps(existingRun: AgenticRun | null = null) {
  const runStore = new Map<string, AgenticRun>();
  if (existingRun) {
    runStore.set(existingRun.Artikel_Nummer, existingRun);
  }

  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const updateAgenticRunStatus = {
    run: jest.fn((payload: any) => {
      const previous = runStore.get(payload.Artikel_Nummer);
      if (!previous) {
        return { changes: 0 };
      }
      runStore.set(payload.Artikel_Nummer, {
        ...previous,
        SearchQuery: payload.SearchQuery,
        Status: payload.Status,
        LastModified: payload.LastModified,
        ReviewState: payload.ReviewState,
        ReviewedBy: payload.ReviewedBy,
        LastReviewDecision: payload.LastReviewDecision,
        LastReviewNotes: payload.LastReviewNotes
      });
      return { changes: 1 };
    })
  };

  const deps = {
    db: { transaction: (fn: () => void) => fn } as any,
    getAgenticRun: { get: jest.fn((itemId: string) => runStore.get(itemId)) } as any,
    getItemReference: { get: jest.fn(() => ({ Artikel_Nummer: 'R-1' })) } as any,
    upsertAgenticRun: { run: jest.fn() } as any,
    updateAgenticRunStatus: updateAgenticRunStatus as any,
    logEvent: jest.fn(),
    logger,
    now: () => new Date('2024-01-01T00:00:00.000Z')
  };

  return { deps, logger, runStore, updateAgenticRunStatus };
}

function makeExistingRun(): AgenticRun {
  return {
    Id: 1,
    Artikel_Nummer: 'R-1',
    SearchQuery: 'prior query',
    Status: AGENTIC_RUN_STATUS_REVIEW,
    LastModified: '2023-12-31T00:00:00.000Z',
    ReviewState: 'needs_review',
    ReviewedBy: 'reviewer-1',
    LastReviewDecision: 'reject',
    LastReviewNotes: 'missing dimensions',
    RetryCount: 0,
    NextRetryAt: null,
    LastError: null,
    LastAttemptAt: null,
    TranscriptUrl: null
  };
}

describe('restartAgenticRun review metadata behavior', () => {
  it('preserves existing review metadata when review payload is omitted', async () => {
    const { deps, runStore } = createDeps(makeExistingRun());

    await restartAgenticRun(
      {
        itemId: 'R-1',
        actor: 'tester',
        searchQuery: 'new query'
      },
      deps as any
    );

    const updated = runStore.get('R-1');
    expect(updated?.ReviewState).toBe('needs_review');
    expect(updated?.ReviewedBy).toBe('reviewer-1');
    expect(updated?.LastReviewDecision).toBe('reject');
    expect(updated?.LastReviewNotes).toBe('missing dimensions');
  });

  it('applies provided review payload without merging legacy review fields', async () => {
    const { deps, runStore } = createDeps(makeExistingRun());

    await restartAgenticRun(
      {
        itemId: 'R-1',
        actor: 'tester',
        searchQuery: 'new query',
        review: {
          decision: null,
          notes: 'updated guidance',
          reviewedBy: null,
          information_present: null,
          missing_spec: ['weight'],
          unneeded_spec: [],
          bad_format: null,
          wrong_information: null,
          wrong_physical_dimensions: null
        } as AgenticRunReviewMetadata
      },
      deps as any
    );

    const updated = runStore.get('R-1');
    expect(updated?.LastReviewNotes).toBe('updated guidance');
    expect(updated?.LastReviewDecision).toBeNull();
    expect(updated?.ReviewedBy).toBeNull();
  });

  it('clears review metadata only when replaceReviewMetadata is explicit without review payload', async () => {
    const { deps, runStore } = createDeps(makeExistingRun());

    await restartAgenticRun(
      {
        itemId: 'R-1',
        actor: 'tester',
        searchQuery: 'new query',
        replaceReviewMetadata: true
      } as AgenticRunRestartInput,
      deps as any
    );

    const updated = runStore.get('R-1');
    expect(updated?.ReviewState).toBe('not_required');
    expect(updated?.ReviewedBy).toBeNull();
    expect(updated?.LastReviewDecision).toBeNull();
    expect(updated?.LastReviewNotes).toBeNull();
  });
});
