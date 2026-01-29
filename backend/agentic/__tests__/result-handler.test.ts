import { jest } from '@jest/globals';
import {
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REVIEW,
  type AgenticRun,
  type AgenticRequestLog
} from '../../../models';

jest.mock('../index', () => ({
  recordAgenticRequestLogUpdate: jest.fn()
}));

const mockAgenticModule = jest.requireMock<typeof import('../index')>('../index');
const { recordAgenticRequestLogUpdate } = mockAgenticModule;

describe('agentic result handler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handleAgenticResult keeps supervisor approvals pending for user review', () => {
    const existingItem = {
      ItemUUID: 'item-123',
      Artikel_Nummer: 'R-100',
      Artikelbeschreibung: 'Example item',
      Datum_erfasst: '2024-01-01T00:00:00.000Z',
      Veröffentlicht_Status: 'no',
      UpdatedAt: '2024-01-01T00:00:00.000Z'
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
      UUID: 'item-123',
      Search: 'example search',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      Error: null,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
      NotifiedAt: null,
      LastNotificationError: null,
      PayloadJson: null
    };

    const items = new Map<string, any>([[existingItem.ItemUUID, existingItem]]);
    const runs = new Map<string, AgenticRun>([[existingRun.Artikel_Nummer, existingRun]]);
    const logEvent = jest.fn();
    const persistItemWithinTransaction = jest.fn();
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
        itemId: 'item-123',
        payload: {
          item: { Artikelbeschreibung: 'Example item', searchQuery: 'example search' },
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
          getItem: { get: (id: string) => items.get(id) },
          getAgenticRun: { get: (id: string) => runs.get(id) },
          persistItemWithinTransaction,
          updateAgenticRunStatus,
          upsertAgenticRun: { run: jest.fn() },
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
    expect(persistItemWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ ItemUUID: 'item-123' })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ EntityId: 'R-100', Event: 'AgenticResultReceived' })
    );
    expect(recordAgenticRequestLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-123' }),
      AGENTIC_RUN_STATUS_REVIEW,
      expect.objectContaining({ searchQuery: 'example search' })
    );
  });
});
