import { jest } from '@jest/globals';
import {
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  type AgenticRun,
  type AgenticRequestLog
} from '../../../models';

// withTransaction must be mocked so the handler doesn't attempt a real Postgres connection
jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

jest.mock('../index', () => {
  const actual = jest.requireActual<typeof import('../index')>('../index');
  return {
    ...actual,
    appendOutcomeTranscriptSection: jest.fn(async () => undefined),
    recordAgenticRequestLogUpdate: jest.fn()
  };
});

const mockAgenticModule = jest.requireMock<typeof import('../index')>('../index');
const { recordAgenticRequestLogUpdate } = mockAgenticModule;

function makeRequestLog(artikelNummer: string, overrides?: Partial<AgenticRequestLog>): AgenticRequestLog {
  const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
  return {
    UUID: artikelNummer,
    Search: 'example search',
    Status: AGENTIC_RUN_STATUS_QUEUED,
    Error: null,
    CreatedAt: nowIso,
    UpdatedAt: nowIso,
    NotifiedAt: null,
    LastNotificationError: null,
    PayloadJson: null,
    ...overrides
  };
}

function makeRun(artikelNummer: string, overrides?: Partial<AgenticRun>): AgenticRun {
  return {
    Id: 1,
    Artikel_Nummer: artikelNummer,
    SearchQuery: 'example search',
    Status: AGENTIC_RUN_STATUS_QUEUED,
    LastModified: '2024-01-01T00:00:00.000Z',
    ReviewState: 'not_required',
    ReviewedBy: null,
    LastReviewDecision: null,
    LastReviewNotes: null,
    RetryCount: 0,
    NextRetryAt: null,
    LastError: null,
    LastAttemptAt: null,
    ...overrides
  };
}

// TODO(agentic-review-history-tests): Add cases for close-action payloads once review source marker contract is finalized.
describe('agentic result handler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handleAgenticResult keeps supervisor approvals pending for user review', async () => {
    const { handleAgenticResult } = await import('../result-handler');

    const requestLog = makeRequestLog('R-100');
    const existingReference = { Artikel_Nummer: 'R-100', Artikelbeschreibung: 'Example item', Veröffentlicht_Status: 'no' };
    const existingRun = makeRun('R-100');

    const persistItemReference = jest.fn(async () => undefined);
    const upsertAgenticRun = jest.fn(async () => undefined);
    const logEvent = jest.fn(async () => undefined);
    const insertAgenticRunReviewHistoryEntry = jest.fn(async () => undefined);

    const ctx = {
      getItemReference: jest.fn(async () => existingReference),
      getAgenticRun: jest.fn(async () => existingRun),
      persistItemReference,
      updateAgenticRunStatus: jest.fn(async () => 1),
      upsertAgenticRun,
      insertAgenticRunReviewHistoryEntry,
      logEvent,
      getAgenticRequestLog: jest.fn(async () => requestLog)
    };

    const result = await handleAgenticResult(
      {
        artikelNummer: 'R-100',
        payload: {
          artikelNummer: 'R-100',
          item: { Artikelbeschreibung: 'Example item', Artikel_Nummer: 'R-100', searchQuery: 'example search' },
          status: 'completed',
          summary: 'done',
          reviewDecision: 'approved',
          reviewedBy: 'supervisor-agent',
          needsReview: false
        }
      },
      { ctx, logger: console }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_REVIEW);
    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-100', Status: AGENTIC_RUN_STATUS_REVIEW })
    );
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-100' })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ EntityId: 'R-100', Event: 'AgenticResultReceived' })
    );
    expect(insertAgenticRunReviewHistoryEntry).not.toHaveBeenCalled();
    expect(recordAgenticRequestLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'R-100' }),
      AGENTIC_RUN_STATUS_REVIEW,
      expect.objectContaining({ searchQuery: 'example search' })
    );
  });

  test('agent completion updates run state but suppresses review history insert for supervisor notes', async () => {
    const { handleAgenticResult } = await import('../result-handler');

    const requestLog = makeRequestLog('R-101');
    const existingReference = { Artikel_Nummer: 'R-101', Artikelbeschreibung: 'Example item', Veröffentlicht_Status: 'no' };
    const existingRun = makeRun('R-101', {
      Id: 101,
      ReviewState: 'rejected',
      ReviewedBy: 'reviewer-a',
      LastReviewDecision: 'rejected',
      LastReviewNotes: 'old reviewer notes'
    });

    const upsertAgenticRun = jest.fn(async () => undefined);
    const insertAgenticRunReviewHistoryEntry = jest.fn(async () => undefined);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const ctx = {
      getItemReference: jest.fn(async () => existingReference),
      getAgenticRun: jest.fn(async () => existingRun),
      persistItemReference: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => 1),
      upsertAgenticRun,
      insertAgenticRunReviewHistoryEntry,
      logEvent: jest.fn(async () => undefined),
      getAgenticRequestLog: jest.fn(async () => requestLog)
    };

    const result = await handleAgenticResult(
      {
        artikelNummer: 'R-101',
        payload: {
          artikelNummer: 'R-101',
          item: { Artikelbeschreibung: 'Example item', Artikel_Nummer: 'R-101', searchQuery: 'example search' },
          status: 'completed',
          summary: 'done',
          reviewDecision: 'approved',
          reviewNotes: 'auto generated supervisor note',
          reviewedBy: 'supervisor-agent',
          needsReview: false,
          actor: 'agentic-service'
        }
      },
      { ctx, logger }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_REVIEW);
    // supervisor approval → status flipped to REVIEW; pending-transition clears prior review metadata
    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'R-101',
        Status: AGENTIC_RUN_STATUS_REVIEW,
        LastReviewDecision: null,
        LastReviewNotes: null,
        ReviewedBy: null
      })
    );
    expect(insertAgenticRunReviewHistoryEntry).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Agentic result suppressed review history metadata from non-human source',
      expect.objectContaining({
        artikelNummer: 'R-101',
        source: 'agentic-service',
        suppressedFields: expect.arrayContaining(['ReviewDecision', 'ReviewNotes'])
      })
    );
  });

  test('retains multiple review events and keeps latest run state', async () => {
    const { handleAgenticResult } = await import('../result-handler');

    const requestLog = makeRequestLog('R-200', { Search: 'search' });
    const existingReference = { Artikel_Nummer: 'R-200', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun = makeRun('R-200', { Id: 2, SearchQuery: 'search' });
    const reviewHistory: Array<Record<string, unknown>> = [];
    const upsertAgenticRun = jest.fn(async () => undefined);
    const insertAgenticRunReviewHistoryEntry = jest.fn(async (entry: Record<string, unknown>) => {
      reviewHistory.push(entry);
    });

    const ctx = {
      getItemReference: jest.fn(async () => existingReference),
      getAgenticRun: jest.fn(async () => existingRun),
      persistItemReference: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => 1),
      upsertAgenticRun,
      insertAgenticRunReviewHistoryEntry,
      logEvent: jest.fn(async () => undefined),
      getAgenticRequestLog: jest.fn(async () => requestLog)
    };

    await handleAgenticResult(
      {
        artikelNummer: 'R-200',
        payload: {
          artikelNummer: 'R-200',
          action: 'review',
          item: { Artikel_Nummer: 'R-200', searchQuery: 'search' },
          status: 'review',
          reviewDecision: 'rejected',
          reviewNotes: 'missing dimensions',
          reviewedBy: 'reviewer-a',
          needsReview: true
        }
      },
      { ctx, logger: console }
    );

    await handleAgenticResult(
      {
        artikelNummer: 'R-200',
        payload: {
          artikelNummer: 'R-200',
          action: 'review',
          item: { Artikel_Nummer: 'R-200', searchQuery: 'search' },
          status: 'completed',
          reviewDecision: 'approved',
          reviewNotes: 'looks good now',
          reviewedBy: 'reviewer-b',
          needsReview: false
        }
      },
      { ctx, logger: console }
    );

    expect(reviewHistory).toHaveLength(2);
    expect(reviewHistory[0]).toEqual(expect.objectContaining({ Status: AGENTIC_RUN_STATUS_REJECTED }));
    expect(reviewHistory[1]).toEqual(expect.objectContaining({ Status: AGENTIC_RUN_STATUS_APPROVED }));
    expect(upsertAgenticRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'R-200',
        Status: AGENTIC_RUN_STATUS_APPROVED,
        LastReviewDecision: 'approved',
        LastReviewNotes: 'looks good now',
        ReviewedBy: 'reviewer-b'
      })
    );
  });

  test('normalizes structured review booleans for history metadata and logs signal counts', async () => {
    const { handleAgenticResult } = await import('../result-handler');

    const requestLog = makeRequestLog('R-300', { Search: 'search' });
    const existingReference = { Artikel_Nummer: 'R-300', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun = makeRun('R-300', { Id: 300, SearchQuery: 'search' });
    const reviewHistory: Array<Record<string, unknown>> = [];
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const ctx = {
      getItemReference: jest.fn(async () => existingReference),
      getAgenticRun: jest.fn(async () => existingRun),
      persistItemReference: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => 1),
      upsertAgenticRun: jest.fn(async () => undefined),
      insertAgenticRunReviewHistoryEntry: jest.fn(async (entry: Record<string, unknown>) => { reviewHistory.push(entry); }),
      logEvent: jest.fn(async () => undefined),
      getAgenticRequestLog: jest.fn(async () => requestLog)
    };

    await handleAgenticResult(
      {
        artikelNummer: 'R-300',
        payload: {
          artikelNummer: 'R-300',
          item: { Artikelbeschreibung: 'Example item', Artikel_Nummer: 'R-300', searchQuery: 'search' },
          status: 'completed',
          summary: 'done',
          actor: 'human-reviewer',
          action: 'review',
          reviewedBy: 'human-reviewer',
          review: {
            information_present: 'false',
            bad_format: 'true',
            wrong_information: 1,
            wrong_physical_dimensions: '0',
            missing_spec: ['Spannung', 'spannung', '  ', 'Material']
          }
        }
      },
      { ctx, logger }
    );

    expect(reviewHistory).toHaveLength(1);
    expect(JSON.parse(String(reviewHistory[0].ReviewMetadata))).toEqual({
      information_present: false,
      missing_spec: ['Spannung', 'Material'],
      unneeded_spec: [],
      bad_format: true,
      wrong_information: true,
      wrong_physical_dimensions: false
    });

    expect(logger.info).toHaveBeenCalledWith(
      'Agentic result normalized review signal summary',
      expect.objectContaining({
        signalPresenceCount: 4,
        signalTrueCount: 2,
        missingSpecCount: 2
      })
    );
  });


  test('persists normalized search links json on run updates', async () => {
    const { handleAgenticResult } = await import('../result-handler');

    const requestLog = makeRequestLog('R-400', { Search: 'search' });
    const existingReference = { Artikel_Nummer: 'R-400', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun = makeRun('R-400', { Id: 400, SearchQuery: 'search' });
    const upsertAgenticRun = jest.fn(async () => undefined);

    const ctx = {
      getItemReference: jest.fn(async () => existingReference),
      getAgenticRun: jest.fn(async () => existingRun),
      persistItemReference: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => 1),
      upsertAgenticRun,
      insertAgenticRunReviewHistoryEntry: jest.fn(async () => undefined),
      logEvent: jest.fn(async () => undefined),
      getAgenticRequestLog: jest.fn(async () => requestLog)
    };

    await handleAgenticResult(
      {
        artikelNummer: 'R-400',
        payload: {
          artikelNummer: 'R-400',
          item: {
            Artikel_Nummer: 'R-400',
            searchQuery: 'search',
            sources: [
              { url: 'https://example.com/a', title: 'A' },
              { url: ' https://example.com/a ' },
              { url: 'https://example.com/b', description: 'desc' },
              { title: 'missing-url' }
            ]
          },
          status: 'completed',
          reviewDecision: 'approved',
          needsReview: false
        }
      },
      { ctx, logger: console }
    );

    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'R-400',
        LastSearchLinksJsonIsSet: 1,
        LastSearchLinksJson: JSON.stringify([
          { url: 'https://example.com/a', title: 'A' },
          { url: 'https://example.com/b', description: 'desc' }
        ])
      })
    );
  });


});
