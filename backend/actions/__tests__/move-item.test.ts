import type { IncomingMessage, ServerResponse } from 'http';

// move-item imports generateShopwareCorrelationId from '../db', which loads better-sqlite3 at
// module level; mock the whole module to keep tests dependency-free
jest.mock('../../db', () => ({
  generateShopwareCorrelationId: jest.fn(() => 'mock-correlation-id'),
}));

import action from '../move-item';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, body?: unknown): IncomingMessage {
  const payload = body !== undefined ? JSON.stringify(body) : '';
  const req: any = { url, method: 'POST', headers: {} };
  req[Symbol.asyncIterator] = async function* () {
    if (payload) yield payload;
  };
  return req as IncomingMessage;
}

function makeCtx(overrides: {
  item?: object | null;
  destBox?: object | null;
  enqueueThrows?: boolean;
} = {}) {
  const logEvent = jest.fn();
  const run = jest.fn();
  const enqueueShopwareSyncJob = jest.fn(() => {
    if (overrides.enqueueThrows) throw new Error('queue error');
  });
  const db = {
    prepare: jest.fn(() => ({ run })),
    transaction: jest.fn((fn: Function) => fn),
  };
  return {
    ctx: {
      getItem: jest.fn(async () => overrides.item ?? { BoxID: 'B-OLD', ItemUUID: 'I-0001' }),
      getBox: jest.fn(async () => overrides.destBox ?? { BoxID: 'B-042', LocationId: 'S-01', Location: null }),
      db,
      logEvent,
      enqueueShopwareSyncJob,
    },
    run,
    logEvent,
    enqueueShopwareSyncJob,
  };
}

describe('move-item action', () => {
  it('matches POST /api/items/:id/move', () => {
    expect(action.matches('/api/items/I-0001/move', 'POST')).toBe(true);
  });

  it('does not match GET', () => {
    expect(action.matches('/api/items/I-0001/move', 'GET')).toBe(false);
  });

  it('does not match unrelated paths', () => {
    expect(action.matches('/api/items/I-0001', 'POST')).toBe(false);
    expect(action.matches('/api/items', 'POST')).toBe(false);
  });

  it('returns 404 when item does not exist', async () => {
    const { ctx } = makeCtx({ item: null });
    const req = makeRequest('/api/items/I-MISSING/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res, getStatus, getBody } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(404);
    expect(getBody().error).toBeDefined();
  });

  it('returns 400 when actor is missing', async () => {
    const { ctx } = makeCtx();
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-042' });
    const { res, getStatus, getBody } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(400);
    expect(getBody().error).toMatch(/actor/);
  });

  it('returns 400 when toBoxId is missing', async () => {
    const { ctx } = makeCtx();
    const req = makeRequest('/api/items/I-0001/move', { actor: 'tester' });
    const { res, getStatus, getBody } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(400);
    expect(getBody().error).toMatch(/toBoxId/);
  });

  it('returns 404 when destination box does not exist', async () => {
    const { ctx } = makeCtx({ destBox: null });
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-NOPE', actor: 'tester' });
    const { res, getStatus, getBody } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(404);
    expect(getBody().error).toBeDefined();
  });

  it('returns 200 and updates item on success', async () => {
    const { ctx, run, logEvent } = makeCtx();
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res, getStatus, getBody } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(200);
    expect(getBody().ok).toBe(true);
    expect(getBody().destinationBoxId).toBe('B-042');
    expect(run).toHaveBeenCalledWith('B-042', 'S-01', 'I-0001');
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ Event: 'Moved', EntityType: 'Item' }));
  });

  it('returns 200 even when Shopware enqueue throws (non-fatal)', async () => {
    const { ctx } = makeCtx({ enqueueThrows: true });
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res, getStatus } = createMockResponse();
    await action.handle(req, res, ctx);
    // enqueue failure is caught and logged; move still succeeds
    expect(getStatus()).toBe(200);
  });

  it('uses LocationId from destination box as resolved location', async () => {
    const { ctx, run } = makeCtx({ destBox: { BoxID: 'B-042', LocationId: 'S-REGAL-3', Location: 'ignore' } });
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res, getStatus } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(getStatus()).toBe(200);
    // LocationId takes priority over Location
    expect(run).toHaveBeenCalledWith('B-042', 'S-REGAL-3', 'I-0001');
  });

  it('falls back to Location when LocationId is absent', async () => {
    const { ctx, run } = makeCtx({ destBox: { BoxID: 'B-042', LocationId: null, Location: 'S-FALLBACK' } });
    const req = makeRequest('/api/items/I-0001/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(run).toHaveBeenCalledWith('B-042', 'S-FALLBACK', 'I-0001');
  });

  it('URL-decodes percent-encoded item id', async () => {
    const { ctx } = makeCtx();
    const req = makeRequest('/api/items/I-0001%2Fspecial/move', { toBoxId: 'B-042', actor: 'tester' });
    const { res } = createMockResponse();
    await action.handle(req, res, ctx);
    expect(ctx.getItem).toHaveBeenCalledWith('I-0001/special');
  });
});
