// Enable auto-approval before any module (config) loads. Only the config module reads this var, and
// other suites' payloads omit `autoApprovable`, so leaking `enabled=true` cannot flip their outcomes.
process.env.AUTO_APPROVE = 'true';

import { jest } from '@jest/globals';
import {
  AGENTIC_RUN_STATUS_AUTO_APPROVED,
  AGENTIC_RUN_STATUS_REVIEW,
  type AgenticRun,
  type AgenticRequestLog,
} from '../../../models';

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
    recordAgenticRequestLogUpdate: jest.fn(),
  };
});

function makeRequestLog(artikelNummer: string): AgenticRequestLog {
  const nowIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
  return {
    UUID: artikelNummer,
    Search: 'example search',
    Status: 'queued',
    Error: null,
    CreatedAt: nowIso,
    UpdatedAt: nowIso,
    NotifiedAt: null,
    LastNotificationError: null,
    PayloadJson: null,
  };
}

function makeRun(artikelNummer: string): AgenticRun {
  return {
    Id: 1,
    Artikel_Nummer: artikelNummer,
    SearchQuery: 'example search',
    Status: 'queued',
    LastModified: '2024-01-01T00:00:00.000Z',
    ReviewState: 'not_required',
    ReviewedBy: null,
    LastReviewDecision: null,
    LastReviewNotes: null,
    RetryCount: 0,
    NextRetryAt: null,
    LastError: null,
    LastAttemptAt: null,
  };
}

function makeCtx(artikelNummer: string, upsertAgenticRun: jest.Mock) {
  return {
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: artikelNummer, Artikelbeschreibung: 'Item', Veröffentlicht_Status: 'no' })),
    getAgenticRun: jest.fn(async () => makeRun(artikelNummer)),
    persistItemReference: jest.fn(async () => undefined),
    updateAgenticRunStatus: jest.fn(async () => 1),
    upsertAgenticRun,
    insertAgenticRunReviewHistoryEntry: jest.fn(async () => undefined),
    logEvent: jest.fn(async () => undefined),
    getAgenticRequestLog: jest.fn(async () => makeRequestLog(artikelNummer)),
  };
}

describe('agentic result handler auto-approval gate (AUTO_APPROVE=true)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('finalizes a clearly-good result as auto_approved instead of forcing review', async () => {
    const { handleAgenticResult } = await import('../result-handler');
    const upsertAgenticRun = jest.fn(async () => undefined);

    const result = await handleAgenticResult(
      {
        artikelNummer: 'A-500',
        payload: {
          artikelNummer: 'A-500',
          item: { Artikelbeschreibung: 'Item', Artikel_Nummer: 'A-500', searchQuery: 'example search' },
          status: 'completed',
          summary: 'done',
          reviewDecision: 'approved',
          reviewedBy: 'supervisor-agent',
          needsReview: false,
          autoApprovable: true,
        },
      },
      { ctx: makeCtx('A-500', upsertAgenticRun), logger: console }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_AUTO_APPROVED);
    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'A-500', Status: AGENTIC_RUN_STATUS_AUTO_APPROVED, ReviewState: 'auto_approved' })
    );
  });

  test('still routes a not-clearly-good supervisor approval to manual review', async () => {
    const { handleAgenticResult } = await import('../result-handler');
    const upsertAgenticRun = jest.fn(async () => undefined);

    const result = await handleAgenticResult(
      {
        artikelNummer: 'A-501',
        payload: {
          artikelNummer: 'A-501',
          item: { Artikelbeschreibung: 'Item', Artikel_Nummer: 'A-501', searchQuery: 'example search' },
          status: 'completed',
          summary: 'done',
          reviewDecision: 'approved',
          reviewedBy: 'supervisor-agent',
          needsReview: false,
          autoApprovable: false,
        },
      },
      { ctx: makeCtx('A-501', upsertAgenticRun), logger: console }
    );

    expect(result.status).toBe(AGENTIC_RUN_STATUS_REVIEW);
    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'A-501', Status: AGENTIC_RUN_STATUS_REVIEW })
    );
  });
});
