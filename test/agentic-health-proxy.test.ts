// Mock db-client before any imports so checkAgenticHealth uses the mock query
jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../backend/db', () => ({
  logAgenticRequestStart: jest.fn(),
  logAgenticRequestEnd: jest.fn(),
  saveAgenticRequestPayload: jest.fn(),
  markAgenticRequestNotificationSuccess: jest.fn(),
  markAgenticRequestNotificationFailure: jest.fn(),
  fetchQueuedAgenticRuns: jest.fn(async () => []),
  fetchIdleFillAgenticRuns: jest.fn(async () => []),
  updateQueuedAgenticRunQueueState: jest.fn(),
  listAgenticRunReviewHistory: jest.fn(async () => []),
}));

import type { IncomingMessage, ServerResponse } from 'http';
import agenticHealthAction from '../backend/actions/agentic-health';
import { checkAgenticHealth } from '../backend/agentic';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../models';

// Import after mocks so the module picks up mock implementations
const dbClient = require('../backend/db-client');

function createMockResponse() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: (status: number, responseHeaders: Record<string, string>) => {
      statusCode = status;
      headers = { ...responseHeaders };
      return res;
    },
    end: (chunk?: unknown) => {
      if (chunk !== undefined && chunk !== null) {
        body = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
      }
      return res;
    }
  } as unknown as ServerResponse;

  return {
    res,
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => body
  };
}

function createDeps() {
  return {
    getAgenticRun: jest.fn(async () => null),
    getItemReference: jest.fn(async () => null),
    upsertAgenticRun: jest.fn(async () => undefined),
    updateAgenticRunStatus: jest.fn(async () => 1),
    logEvent: jest.fn(async () => undefined),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('agentic health action', () => {
  test('responds with aggregated queue metrics from the in-process orchestrator', async () => {
    dbClient.query.mockResolvedValue([
      { status: AGENTIC_RUN_STATUS_QUEUED, count: 2, lastModified: '2024-01-02T00:00:00.000Z' },
      { status: AGENTIC_RUN_STATUS_RUNNING, count: 1, lastModified: '2024-01-03T12:34:56.000Z' }
    ]);

    const ctx = createDeps();
    const { res, getStatus, getBody } = createMockResponse();

    await agenticHealthAction.handle?.({} as IncomingMessage, res, ctx as any);

    expect(getStatus()).toBe(200);
    const payload = JSON.parse(getBody());
    expect(payload).toEqual({
      ok: true,
      details: {
        ok: true,
        queuedRuns: 2,
        runningRuns: 1,
        lastUpdatedAt: '2024-01-03T12:34:56.000Z'
      }
    });
  });
});

describe('checkAgenticHealth', () => {
  test('returns failure payload and logs when the database query throws', async () => {
    const errorLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    dbClient.query.mockRejectedValue(new Error('query failed'));

    const result = await checkAgenticHealth(createDeps() as any);

    expect(result.ok).toBe(false);
    expect((result as { message?: string }).message).toBe('query failed');
  });
});
