import Database from 'better-sqlite3';

process.env.DB_PATH = ':memory:';

jest.mock('../../db', () => {
  const original = jest.requireActual('../../db');
  return {
    ...original,
    logAgenticRequestStart: jest.fn(),
    logAgenticRequestEnd: jest.fn(),
    saveAgenticRequestPayload: jest.fn(),
    markAgenticRequestNotificationSuccess: jest.fn(),
    markAgenticRequestNotificationFailure: jest.fn()
  };
});

import { startAgenticRun } from '../../agentic';
import { AGENTIC_RUN_STATUS_QUEUED } from '../../../models';
import * as agenticDb from '../../db';

type AgenticDbMocks = jest.Mocked<typeof agenticDb>;

function createAgenticDependencies() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE agentic_runs (
      ItemUUID TEXT PRIMARY KEY,
      SearchQuery TEXT,
      Status TEXT,
      LastModified TEXT,
      ReviewState TEXT,
      ReviewedBy TEXT,
      LastReviewDecision TEXT,
      LastReviewNotes TEXT
    );
  `);

  const upsertAgenticRun = db.prepare(`
    INSERT INTO agentic_runs (
      ItemUUID,
      SearchQuery,
      Status,
      LastModified,
      ReviewState,
      ReviewedBy,
      LastReviewDecision,
      LastReviewNotes
    )
    VALUES (
      @ItemUUID,
      @SearchQuery,
      @Status,
      @LastModified,
      @ReviewState,
      @ReviewedBy,
      @LastReviewDecision,
      @LastReviewNotes
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      SearchQuery=excluded.SearchQuery,
      Status=excluded.Status,
      LastModified=excluded.LastModified,
      ReviewState=excluded.ReviewState,
      ReviewedBy=excluded.ReviewedBy,
      LastReviewDecision=excluded.LastReviewDecision,
      LastReviewNotes=excluded.LastReviewNotes
  `);

  const updateAgenticRunStatus = db.prepare(`
    UPDATE agentic_runs
       SET SearchQuery=@SearchQuery,
           Status=@Status,
           LastModified=@LastModified,
           ReviewState=@ReviewState,
           ReviewedBy=@ReviewedBy,
           LastReviewDecision=@LastReviewDecision,
           LastReviewNotes=@LastReviewNotes
     WHERE ItemUUID=@ItemUUID
  `);

  return {
    db,
    getAgenticRun: db.prepare('SELECT * FROM agentic_runs WHERE ItemUUID = ?'),
    upsertAgenticRun,
    updateAgenticRunStatus,
    logEvent: jest.fn(),
    now: () => new Date('2024-01-01T00:00:00.000Z'),
    logger: console
  };
}

describe('agentic request logging integration', () => {
  const mockedDb = agenticDb as AgenticDbMocks;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('startAgenticRun success persists run and logs lifecycle', async () => {
    const deps = createAgenticDependencies();
    const requestPayload = { source: 'jest', attempt: 1 };

    const result = await startAgenticRun(
      {
        itemId: 'item-123',
        searchQuery: 'example search',
        context: 'jest-test',
        request: {
          id: 'req-123',
          payload: requestPayload
        }
      },
      deps
    );

    expect(result.queued).toBe(true);
    expect(result.agentic?.Status).toBe(AGENTIC_RUN_STATUS_QUEUED);

    const stored = deps.getAgenticRun.get('item-123') as any;
    expect(stored.Status).toBe(AGENTIC_RUN_STATUS_QUEUED);
    expect(stored.SearchQuery).toBe('example search');

    expect(mockedDb.saveAgenticRequestPayload).toHaveBeenCalledWith('req-123', requestPayload);
    expect(mockedDb.logAgenticRequestStart).toHaveBeenCalledWith('req-123', 'example search');
    expect(mockedDb.logAgenticRequestEnd).toHaveBeenCalledWith('req-123', 'SUCCESS', null);
    expect(mockedDb.markAgenticRequestNotificationFailure).not.toHaveBeenCalled();
    expect(mockedDb.markAgenticRequestNotificationSuccess).not.toHaveBeenCalled();

    deps.db.close();
  });

  test('startAgenticRun validation failure records declined request without creating run', async () => {
    const deps = createAgenticDependencies();

    const result = await startAgenticRun(
      {
        itemId: 'item-abc',
        searchQuery: '',
        context: 'jest-failure',
        request: {
          id: 'req-decline',
          payload: { attempt: 'decline' }
        }
      },
      deps
    );

    expect(result.queued).toBe(false);
    expect(result.reason).toBe('missing-search-query');
    const stored = deps.getAgenticRun.get('item-abc');
    expect(stored).toBeUndefined();

    expect(mockedDb.saveAgenticRequestPayload).toHaveBeenCalledWith('req-decline', { attempt: 'decline' });
    expect(mockedDb.logAgenticRequestStart).not.toHaveBeenCalled();
    expect(mockedDb.logAgenticRequestEnd).toHaveBeenCalledWith('req-decline', 'DECLINED', 'missing-search-query');

    deps.db.close();
  });
});
