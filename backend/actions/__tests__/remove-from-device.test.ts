import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn({})),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

jest.mock('../../db', () => ({
  insertQualityAssessment: jest.fn(async () => 42),
  updateItemQualityAssessment: jest.fn(async () => undefined),
  generateShopwareCorrelationId: jest.fn(() => 'corr-remove-123'),
}));

import action from '../remove-from-device';
import * as dbClient from '../../db-client';
import * as db from '../../db';

const mockQueryOne = dbClient.queryOne as jest.Mock;
const mockExecute = dbClient.execute as jest.Mock;
const mockInsertQA = db.insertQualityAssessment as jest.Mock;
const mockUpdateQA = db.updateItemQualityAssessment as jest.Mock;

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

const sparePartItem = { ItemUUID: 'FAN-001', BoxID: null };
const destBox = { BoxID: 'B-042', LocationId: 'S-01', Location: 'Regal 1' };

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    getItem: jest.fn(async () => sparePartItem),
    getBox: jest.fn(async () => destBox),
    logEvent: jest.fn(async () => undefined),
    enqueueShopwareSyncJob: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockQueryOne.mockReset();
  mockExecute.mockReset();
  mockInsertQA.mockReset();
  mockUpdateQA.mockReset();
  mockQueryOne.mockResolvedValue({ ParentItemUUID: 'P-001' });
  mockExecute.mockResolvedValue(1);
  mockInsertQA.mockResolvedValue(42);
  mockUpdateQA.mockResolvedValue(undefined);
});

describe('remove-from-device action', () => {
  describe('matches()', () => {
    it('matches POST /remove-from-device', () => {
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'POST')).toBe(true);
    });
    it('does not match GET or other methods', () => {
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'GET')).toBe(false);
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'DELETE')).toBe(false);
    });
    it('does not match unrelated paths', () => {
      expect(action.matches('/api/items/some-uuid/spare-parts', 'POST')).toBe(false);
    });
  });

  describe('POST /remove-from-device', () => {
    it('relocates item and returns 200 with toBoxId and locationId', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(getBody().toBoxId).toBe('B-042');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE items'),
        expect.arrayContaining(['B-042', 'FAN-001'])
      );
    });

    it('logs RemovedFromDevice on the spare part', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const removedEvent = ctx.logEvent.mock.calls.find(
        (c: any[]) => c[0].Event === 'RemovedFromDevice'
      );
      expect(removedEvent).toBeDefined();
      expect(removedEvent[0].EntityId).toBe('FAN-001');
      const meta = JSON.parse(removedEvent[0].Meta);
      expect(meta.parentUuid).toBe('P-001');
      expect(meta.toBoxId).toBe('B-042');
    });

    it('logs SparePartRemoved on the parent device', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const parentEvent = ctx.logEvent.mock.calls.find(
        (c: any[]) => c[0].Event === 'SparePartRemoved'
      );
      expect(parentEvent).toBeDefined();
      expect(parentEvent[0].EntityId).toBe('P-001');
      const meta = JSON.parse(parentEvent[0].Meta);
      expect(meta.childItemUUID).toBe('FAN-001');
    });

    it('marks parent device as Ersatzteil via quality assessment', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(mockInsertQA).toHaveBeenCalledWith(expect.objectContaining({
        tag: 'Ersatzteil',
        value: 1,
        is_functional: false,
        reviewed_by: 'alice',
      }));
      expect(mockUpdateQA).toHaveBeenCalledWith('P-001', 42, 1);
    });

    it('enqueues Shopware sync for parent device', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(ctx.enqueueShopwareSyncJob).toHaveBeenCalledWith(expect.objectContaining({
        JobType: 'item-upsert',
      }));
    });

    it('returns 404 when item not found', async () => {
      const ctx = makeCtx({ getItem: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/MISSING/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });

    it('returns 400 when actor is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', { toBoxId: 'B-042' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
    });

    it('returns 400 when toBoxId is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', { actor: 'alice' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
    });

    it('returns 400 when item has no Zerlegt_aus relation', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toMatch(/Ersatzteil/);
    });

    it('returns 404 when destination box not found', async () => {
      const ctx = makeCtx({ getBox: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-MISSING',
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });

    it('still succeeds when quality assessment insertion fails', async () => {
      mockInsertQA.mockRejectedValue(new Error('DB error'));
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      // QA failure is non-fatal: item is still relocated
      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
    });
  });
});
