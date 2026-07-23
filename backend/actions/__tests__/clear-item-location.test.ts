import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db', () => ({
  clearItemLocation: jest.fn(async () => 1),
  generateShopwareCorrelationId: jest.fn(() => 'corr-clear-123'),
}));

import action from '../clear-item-location';
import * as db from '../../db';

const mockClearLocation = db.clearItemLocation as jest.Mock;

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, method: string, body?: unknown): IncomingMessage {
  const payload = body !== undefined ? JSON.stringify(body) : '';
  const req: any = { url, method, headers: {} };
  req[Symbol.asyncIterator] = async function* () {
    if (payload) yield payload;
  };
  return req as IncomingMessage;
}

const boxItem = { ItemUUID: 'I-1234', BoxID: 'B-007', Auf_Lager: 1 };

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    getItem: jest.fn(async () => boxItem),
    logEvent: jest.fn(async () => undefined),
    enqueueShopwareSyncJob: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockClearLocation.mockReset();
  mockClearLocation.mockResolvedValue(1);
});

describe('clear-item-location action', () => {
  describe('matches()', () => {
    it('matches POST /clear-location', () => {
      expect(action.matches('/api/items/I-1234/clear-location', 'POST')).toBe(true);
    });
    it('does not match other methods or paths', () => {
      expect(action.matches('/api/items/I-1234/clear-location', 'GET')).toBe(false);
      expect(action.matches('/api/items/I-1234/remove', 'POST')).toBe(false);
    });
  });

  describe('POST /clear-location', () => {
    it('clears the location and returns 200 with fromBox', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', { actor: 'alice' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(getBody().fromBox).toBe('B-007');
      expect(mockClearLocation).toHaveBeenCalledWith('I-1234');
    });

    it('logs LocationCleared with the previous box in Meta', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', { actor: 'alice' });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const event = ctx.logEvent.mock.calls.find((c: any[]) => c[0].Event === 'LocationCleared');
      expect(event).toBeDefined();
      expect(event[0].EntityId).toBe('I-1234');
      expect(JSON.parse(event[0].Meta).fromBox).toBe('B-007');
    });

    it('enqueues a Shopware item-move job to null box', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', { actor: 'alice' });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(ctx.enqueueShopwareSyncJob).toHaveBeenCalledWith(expect.objectContaining({
        JobType: 'item-move',
      }));
      const payload = JSON.parse(ctx.enqueueShopwareSyncJob.mock.calls[0][0].Payload);
      expect(payload.toBoxId).toBeNull();
    });

    it('does not zero stock (clearItemLocation preserves Auf_Lager)', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', { actor: 'alice' });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      // Only the location-clear helper runs; there is no stock-zeroing call in this action.
      expect(mockClearLocation).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when item not found', async () => {
      const ctx = makeCtx({ getItem: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/MISSING/clear-location', 'POST', { actor: 'alice' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(mockClearLocation).not.toHaveBeenCalled();
    });

    it('returns 400 when actor is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', {});
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(mockClearLocation).not.toHaveBeenCalled();
    });

    it('still returns 200 when Shopware enqueue fails', async () => {
      const ctx = makeCtx({
        enqueueShopwareSyncJob: jest.fn().mockRejectedValue(new Error('queue down')),
      });
      const req = makeRequest('/api/items/I-1234/clear-location', 'POST', { actor: 'alice' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
    });
  });
});
