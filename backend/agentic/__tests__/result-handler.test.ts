import { jest } from '@jest/globals';
import {
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  type AgenticRun,
  type AgenticRequestLog
} from '../../../models';

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

// TODO(agentic-review-history-tests): Add cases for close-action payloads once review source marker contract is finalized.
describe('agentic result handler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handleAgenticResult keeps supervisor approvals pending for user review', () => {
    const existingReference = {
      Artikel_Nummer: 'R-100',
      Artikelbeschreibung: 'Example item',
      Veröffentlicht_Status: 'no'
    };
    const existingRun: AgenticRun = {
      Id: 1,
      Artikel_Nummer: 'R-100',
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
      LastAttemptAt: null
    };
    const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const requestLog: AgenticRequestLog = {
      UUID: 'R-100',
      Search: 'example search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      Error: null,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
      NotifiedAt: null,
      LastNotificationError: null,
      PayloadJson: null
    };

    const references = new Map<string, any>([[existingReference.Artikel_Nummer, existingReference]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const logEvent = jest.fn();
    const persistItemReference = jest.fn();
    const insertAgenticRunReviewHistoryEntry = { run: jest.fn() };
    const updateAgenticRunStatus = {
      run: jest.fn((update: Record<string, unknown>) => {
        const merged = { ...runs.get(update.Artikel_Nummer as string), ...update } as AgenticRun;
        runs.set(update.Artikel_Nummer as string, merged);
        return { changes: 1 };
      })
    };

    const { handleAgenticResult } = jest.requireActual<typeof import('../result-handler')>(
      '../result-handler'
    );

    const result = handleAgenticResult(
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
      {
        ctx: {
          db: {
            transaction: <T extends (...args: any[]) => any>(fn: T) =>
              (...args: Parameters<T>): ReturnType<T> => fn(...args)
          },
          getItemReference: { get: (id: string) => references.get(id) },
          getAgenticRun: { get: (id: string) => runs.get(id) },
          persistItemReference,
          updateAgenticRunStatus,
          upsertAgenticRun: { run: jest.fn() },
          insertAgenticRunReviewHistoryEntry,
          logEvent,
          getAgenticRequestLog: () => requestLog
        },
        logger: console
      }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_REVIEW);
    expect(updateAgenticRunStatus.run).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-100', Status: AGENTIC_RUN_STATUS_REVIEW })
    );
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-100' })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ EntityId: 'R-100', Event: 'AgenticResultReceived' })
    );
    expect(insertAgenticRunReviewHistoryEntry.run).not.toHaveBeenCalled();
    expect(recordAgenticRequestLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'R-100' }),
      AGENTIC_RUN_STATUS_REVIEW,
      expect.objectContaining({ searchQuery: 'example search' })
    );
  });

  test('agent completion updates run state but suppresses review history insert for supervisor notes', () => {
    const existingReference = {
      Artikel_Nummer: 'R-101',
      Artikelbeschreibung: 'Example item',
      Veröffentlicht_Status: 'no'
    };
    const existingRun: AgenticRun = {
      Id: 101,
      Artikel_Nummer: 'R-101',
      SearchQuery: 'example search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'rejected',
      ReviewedBy: 'reviewer-a',
      LastReviewDecision: 'rejected',
      LastReviewNotes: 'old reviewer notes',
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };
    const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const requestLog: AgenticRequestLog = {
      UUID: 'R-101',
      Search: 'example search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      Error: null,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
      NotifiedAt: null,
      LastNotificationError: null,
      PayloadJson: null
    };

    const references = new Map<string, any>([[existingReference.Artikel_Nummer, existingReference]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const reviewHistory: Array<Record<string, unknown>> = [];
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const { handleAgenticResult } = jest.requireActual<typeof import('../result-handler')>('../result-handler');

    const result = handleAgenticResult(
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
      {
        ctx: {
          db: {
            transaction: <T extends (...args: any[]) => any>(fn: T) =>
              (...args: Parameters<T>): ReturnType<T> => fn(...args)
          },
          getItemReference: { get: (id: string) => references.get(id) },
          getAgenticRun: { get: (id: string) => runs.get(id) },
          persistItemReference: jest.fn(),
          updateAgenticRunStatus: {
            run: jest.fn((update: Record<string, unknown>) => {
              const merged = { ...runs.get(update.Artikel_Nummer as string), ...update } as AgenticRun;
              runs.set(update.Artikel_Nummer as string, merged);
              return { changes: 1 };
            })
          },
          upsertAgenticRun: { run: jest.fn() },
          insertAgenticRunReviewHistoryEntry: { run: jest.fn((entry: Record<string, unknown>) => reviewHistory.push(entry)) },
          logEvent: jest.fn(),
          getAgenticRequestLog: () => requestLog
        },
        logger
      }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_REVIEW);
    expect(runs.get('R-101')).toEqual(
      expect.objectContaining({
        Status: AGENTIC_RUN_STATUS_REVIEW,
        LastReviewDecision: null,
        LastReviewNotes: null,
        ReviewedBy: null
      })
    );
    expect(reviewHistory).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith(
      'Agentic result suppressed review history metadata from non-human source',
      expect.objectContaining({
        artikelNummer: 'R-101',
        source: 'agentic-service',
        suppressedFields: expect.arrayContaining(['ReviewDecision', 'ReviewNotes'])
      })
    );
  });

  test('retains multiple review events and keeps latest run state', () => {
    const existingReference = { Artikel_Nummer: 'R-200', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun: AgenticRun = {
      Id: 2,
      Artikel_Nummer: 'R-200',
      SearchQuery: 'search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };
    const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const requestLog: AgenticRequestLog = {
      UUID: 'R-200',
      Search: 'search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      Error: null,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
      NotifiedAt: null,
      LastNotificationError: null,
      PayloadJson: null
    };

    const references = new Map<string, any>([[existingReference.Artikel_Nummer, existingReference]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const reviewHistory: Array<Record<string, unknown>> = [];
    const updateAgenticRunStatus = {
      run: jest.fn((update: Record<string, unknown>) => {
        const merged = { ...runs.get(update.Artikel_Nummer as string), ...update } as AgenticRun;
        runs.set(update.Artikel_Nummer as string, merged);
        return { changes: 1 };
      })
    };

    const { handleAgenticResult } = jest.requireActual<typeof import('../result-handler')>('../result-handler');

    const baseCtx = {
      db: { transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>): ReturnType<T> => fn(...args) },
      getItemReference: { get: (id: string) => references.get(id) },
      getAgenticRun: { get: (id: string) => runs.get(id) },
      persistItemReference: jest.fn(),
      updateAgenticRunStatus,
      upsertAgenticRun: { run: jest.fn() },
      insertAgenticRunReviewHistoryEntry: { run: jest.fn((entry: Record<string, unknown>) => reviewHistory.push(entry)) },
      logEvent: jest.fn(),
      getAgenticRequestLog: () => requestLog
    };

    handleAgenticResult(
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
      { ctx: baseCtx, logger: console }
    );

    handleAgenticResult(
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
      { ctx: baseCtx, logger: console }
    );

    expect(reviewHistory).toHaveLength(2);
    expect(reviewHistory[0]).toEqual(expect.objectContaining({ Status: AGENTIC_RUN_STATUS_REJECTED }));
    expect(reviewHistory[1]).toEqual(expect.objectContaining({ Status: AGENTIC_RUN_STATUS_APPROVED }));
    expect(runs.get('R-200')).toEqual(
      expect.objectContaining({
        Status: AGENTIC_RUN_STATUS_APPROVED,
        LastReviewDecision: 'approved',
        LastReviewNotes: 'looks good now',
        ReviewedBy: 'reviewer-b'
      })
    );
  });

  test('normalizes structured review booleans for history metadata and logs signal counts', () => {
    const existingReference = { Artikel_Nummer: 'R-300', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun: AgenticRun = {
      Id: 300,
      Artikel_Nummer: 'R-300',
      SearchQuery: 'search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };
    const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const requestLog: AgenticRequestLog = {
      UUID: 'R-300',
      Search: 'search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      Error: null,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
      NotifiedAt: null,
      LastNotificationError: null,
      PayloadJson: null
    };

    const references = new Map<string, any>([[existingReference.Artikel_Nummer, existingReference]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const reviewHistory: Array<Record<string, unknown>> = [];
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const { handleAgenticResult } = jest.requireActual<typeof import('../result-handler')>('../result-handler');

    handleAgenticResult(
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
      {
        ctx: {
          db: { transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>): ReturnType<T> => fn(...args) },
          getItemReference: { get: (id: string) => references.get(id) },
          getAgenticRun: { get: (id: string) => runs.get(id) },
          persistItemReference: jest.fn(),
          updateAgenticRunStatus: {
            run: jest.fn((update: Record<string, unknown>) => {
              const merged = { ...runs.get(update.Artikel_Nummer as string), ...update } as AgenticRun;
              runs.set(update.Artikel_Nummer as string, merged);
              return { changes: 1 };
            })
          },
          upsertAgenticRun: { run: jest.fn() },
          insertAgenticRunReviewHistoryEntry: { run: jest.fn((entry: Record<string, unknown>) => reviewHistory.push(entry)) },
          logEvent: jest.fn(),
          getAgenticRequestLog: () => requestLog
        },
        logger
      }
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


  test('persists normalized search links json on run updates', () => {
    const existingReference = { Artikel_Nummer: 'R-400', Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' };
    const existingRun: AgenticRun = {
      Id: 400,
      Artikel_Nummer: 'R-400',
      SearchQuery: 'search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const references = new Map<string, any>([[existingReference.Artikel_Nummer, existingReference]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const updateAgenticRunStatus = {
      run: jest.fn((update: Record<string, unknown>) => {
        const merged = { ...runs.get(update.Artikel_Nummer as string), ...update } as AgenticRun;
        runs.set(update.Artikel_Nummer as string, merged);
        return { changes: 1 };
      })
    };

    const { handleAgenticResult } = jest.requireActual<typeof import('../result-handler')>('../result-handler');

    handleAgenticResult(
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
      {
        ctx: {
          db: { transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>): ReturnType<T> => fn(...args) },
          getItemReference: { get: (id: string) => references.get(id) },
          getAgenticRun: { get: (id: string) => runs.get(id) },
          persistItemReference: jest.fn(),
          updateAgenticRunStatus,
          upsertAgenticRun: { run: jest.fn() },
          insertAgenticRunReviewHistoryEntry: { run: jest.fn() },
          logEvent: jest.fn(),
          getAgenticRequestLog: () => ({
            UUID: 'R-400',
            Search: 'search',
            Status: AGENTIC_RUN_STATUS_QUEUED,
            Error: null,
            CreatedAt: '2024-01-01T00:00:00.000Z',
            UpdatedAt: '2024-01-01T00:00:00.000Z',
            NotifiedAt: null,
            LastNotificationError: null,
            PayloadJson: null
          })
        },
        logger: console
      }
    );

    expect(updateAgenticRunStatus.run).toHaveBeenCalledWith(
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
