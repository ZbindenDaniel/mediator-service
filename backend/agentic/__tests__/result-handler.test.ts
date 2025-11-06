import { jest } from '@jest/globals';
import { AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_QUEUED, type AgenticRun } from '../../../models';

jest.mock('../agentic', () => ({
  recordAgenticRequestLogUpdate: jest.fn()
}));

const { recordAgenticRequestLogUpdate } = jest.requireMock('../agentic');

describe('agentic result handler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handleAgenticResult promotes queued run to approved without HTTP', () => {
    const existingItem = {
      ItemUUID: 'item-123',
      Artikelbeschreibung: 'Example item',
      Datum_erfasst: '2024-01-01T00:00:00.000Z',
      Veröffentlicht_Status: 'no',
      UpdatedAt: '2024-01-01T00:00:00.000Z'
    };
    const existingRun: AgenticRun = {
      Id: 1,
      ItemUUID: 'item-123',
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
    const requestLog = { UUID: 'item-123', Search: 'example search' };

    const items = new Map<string, any>([[existingItem.ItemUUID, existingItem]]);
    const runs = new Map<string, AgenticRun>([[existingRun.ItemUUID, existingRun]]);
    const logEvent = jest.fn();
    const persistItemWithinTransaction = jest.fn();
    const updateAgenticRunStatus = {
      run: jest.fn((update: Record<string, unknown>) => {
        const merged = { ...runs.get(update.ItemUUID as string), ...update } as AgenticRun;
        runs.set(update.ItemUUID as string, merged);
        return { changes: 1 };
      })
    };

    const { handleAgenticResult } = jest.requireActual('../result-handler');

    const result = handleAgenticResult(
      {
        itemId: 'item-123',
        payload: {
          item: { Artikelbeschreibung: 'Example item', searchQuery: 'example search' },
          status: 'completed',
          summary: 'done',
          reviewDecision: 'approved',
          reviewedBy: 'auto-agent',
          needsReview: false
        }
      },
      {
        ctx: {
          db: {
            transaction: (fn: (...args: any[]) => void) => (...args: any[]) => fn(...args)
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

    expect(result.status).toBe(AGENTIC_RUN_STATUS_APPROVED);
    expect(updateAgenticRunStatus.run).toHaveBeenCalledWith(
      expect.objectContaining({ Status: AGENTIC_RUN_STATUS_APPROVED })
    );
    expect(persistItemWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ ItemUUID: 'item-123' })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ EntityId: 'item-123', Event: 'AgenticResultReceived' })
    );
    expect(recordAgenticRequestLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-123' }),
      AGENTIC_RUN_STATUS_APPROVED,
      expect.objectContaining({ searchQuery: 'example search' })
    );
  });
});
