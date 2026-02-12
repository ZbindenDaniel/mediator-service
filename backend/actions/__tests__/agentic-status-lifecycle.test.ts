import type { IncomingMessage, ServerResponse } from 'http';
import action from '../agentic-status';
import { AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_REJECTED } from '../../../models';

type MockResponse = {
  res: ServerResponse;
  getStatus: () => number | undefined;
  getBody: () => any;
};

function createMockResponse(): MockResponse {
  let statusCode: number | undefined;
  let body: any;
  const res: Partial<ServerResponse> & { writeHead: jest.Mock; end: jest.Mock } = {
    writeHead: jest.fn((status: number) => {
      statusCode = status;
      return res;
    }),
    end: jest.fn((payload?: any) => {
      body = payload ? JSON.parse(payload) : undefined;
    })
  } as any;

  return {
    res: res as ServerResponse,
    getStatus: () => statusCode,
    getBody: () => body
  };
}

function createJsonRequest(url: string, body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  return {
    url,
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
    }
  } as IncomingMessage;
}

describe('agentic-status lifecycle transitions', () => {
  const baseRun = {
    Artikel_Nummer: 'A-100',
    ReviewState: 'in_review',
    Status: 'review'
  };

  // TODO(agentic-status-tests): Extend lifecycle coverage for db exception payload details if transition contracts evolve.
  it('stores checklist submit as pending with no final decision', async () => {
    const updateAgenticReview = { run: jest.fn(() => ({ changes: 1 })) };
    const getAgenticRun = { get: jest.fn(() => baseRun) };
    const ctx = {
      db: {},
      getAgenticRun,
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      updateAgenticReview,
      logEvent: jest.fn()
    };

    const req = createJsonRequest('/api/item-refs/A-100/agentic/review', {
      actor: 'qa-user',
      action: 'review',
      notes: 'checklist complete'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(updateAgenticReview.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        ReviewState: 'pending',
        Status: null,
        LastReviewDecision: null,
        ReviewedBy: 'qa-user'
      })
    );
  });

  it('finalizes close path as approved and overwrites pending state', async () => {
    const updateAgenticReview = { run: jest.fn(() => ({ changes: 1 })) };
    const getAgenticRun = {
      get: jest
        .fn()
        .mockReturnValueOnce({ ...baseRun, ReviewState: 'pending', Status: 'review' })
        .mockReturnValueOnce({ ...baseRun, ReviewState: 'approved', Status: AGENTIC_RUN_STATUS_APPROVED, LastReviewDecision: 'approved' })
    };
    const ctx = {
      db: {},
      getAgenticRun,
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      updateAgenticReview,
      logEvent: jest.fn()
    };

    const req = createJsonRequest('/api/item-refs/A-100/agentic/close', {
      actor: 'qa-user',
      notes: 'closing review'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(updateAgenticReview.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        ReviewState: 'approved',
        Status: AGENTIC_RUN_STATUS_APPROVED,
        LastReviewDecision: 'approved'
      })
    );
    expect(getBody().agentic?.ReviewState).toBe('approved');
  });

  it('accepts explicit final decision and clears pending by rejecting', async () => {
    const updateAgenticReview = { run: jest.fn(() => ({ changes: 1 })) };
    const getAgenticRun = {
      get: jest
        .fn()
        .mockReturnValueOnce({ ...baseRun, ReviewState: 'pending', Status: 'review' })
        .mockReturnValueOnce({ ...baseRun, ReviewState: 'rejected', Status: AGENTIC_RUN_STATUS_REJECTED, LastReviewDecision: 'rejected' })
    };
    const ctx = {
      db: {},
      getAgenticRun,
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      updateAgenticReview,
      logEvent: jest.fn()
    };

    const req = createJsonRequest('/api/item-refs/A-100/agentic/review', {
      actor: 'qa-user',
      action: 'review',
      decision: 'rejected',
      notes: 'final rejection'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(updateAgenticReview.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        ReviewState: 'rejected',
        Status: AGENTIC_RUN_STATUS_REJECTED,
        LastReviewDecision: 'rejected'
      })
    );
    expect(getBody().agentic?.ReviewState).toBe('rejected');
    expect(getBody().agentic?.ReviewState).not.toBe('pending');
  });
});
