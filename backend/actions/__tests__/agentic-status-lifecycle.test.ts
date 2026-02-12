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
  // TODO(agentic-review-history-tests): Add assertion for review history source metadata if schema introduces explicit source column.
  it('finalizes checklist submit as approved when no negative checklist signal is present', async () => {
    const updateAgenticReview = { run: jest.fn(() => ({ changes: 1 })) };
    const getAgenticRun = { get: jest.fn(() => baseRun) };
    const ctx = {
      db: {},
      getAgenticRun,
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      updateAgenticReview,
      logEvent: jest.fn(),
      insertAgenticRunReviewHistoryEntry: { run: jest.fn(() => ({ changes: 1 })) }
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
        ReviewState: 'approved',
        Status: AGENTIC_RUN_STATUS_APPROVED,
        LastReviewDecision: 'approved',
        ReviewedBy: 'qa-user'
      })
    );
    expect(ctx.insertAgenticRunReviewHistoryEntry.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        Status: AGENTIC_RUN_STATUS_APPROVED,
        ReviewState: 'approved',
        ReviewDecision: 'approved'
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
      logEvent: jest.fn(),
      insertAgenticRunReviewHistoryEntry: { run: jest.fn(() => ({ changes: 1 })) }
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
    expect(ctx.insertAgenticRunReviewHistoryEntry.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        ReviewState: 'approved',
        ReviewDecision: 'approved'
      })
    );
  });


  it('finalizes checklist submit as rejected when at least one negative checklist signal is present', async () => {
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
      logEvent: jest.fn(),
      insertAgenticRunReviewHistoryEntry: { run: jest.fn(() => ({ changes: 1 })) }
    };

    const req = createJsonRequest('/api/item-refs/A-100/agentic/review', {
      actor: 'qa-user',
      action: 'review',
      bad_format: true,
      notes: 'checklist complete'
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
    expect(ctx.insertAgenticRunReviewHistoryEntry.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        Status: AGENTIC_RUN_STATUS_REJECTED,
        ReviewState: 'rejected',
        ReviewDecision: 'rejected'
      })
    );
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
      logEvent: jest.fn(),
      insertAgenticRunReviewHistoryEntry: { run: jest.fn(() => ({ changes: 1 })) }
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
    expect(ctx.insertAgenticRunReviewHistoryEntry.run).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'A-100',
        ReviewState: 'rejected',
        ReviewDecision: 'rejected'
      })
    );
  });
  it('does not fail review when history insert throws', async () => {
    const updateAgenticReview = { run: jest.fn(() => ({ changes: 1 })) };
    const getAgenticRun = { get: jest.fn(() => baseRun) };
    const ctx = {
      db: {},
      getAgenticRun,
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      updateAgenticReview,
      logEvent: jest.fn(),
      insertAgenticRunReviewHistoryEntry: { run: jest.fn(() => { throw new Error('history-down'); }) }
    };

    const req = createJsonRequest('/api/item-refs/A-100/agentic/review', {
      actor: 'qa-user',
      action: 'review',
      notes: 'checklist complete'
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(updateAgenticReview.run).toHaveBeenCalled();
    expect(ctx.insertAgenticRunReviewHistoryEntry.run).toHaveBeenCalled();
  });

});
