import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn({})),
  query: jest.fn(async () => []),
  queryOne: jest.fn(),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 0),
  execBatch: jest.fn(async () => undefined),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

import action from '../edit-item-instance';
import * as dbClient from '../../db-client';

const mockQueryOne = dbClient.queryOne as jest.Mock;
const mockExecute = dbClient.execute as jest.Mock;

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, method: string, body?: object): IncomingMessage {
  const raw = body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined;
  const req: any = { url, method, headers: {} };
  if (raw) {
    req[Symbol.asyncIterator] = async function* () { yield raw; };
  } else {
    req[Symbol.asyncIterator] = async function* () {};
  }
  return req as IncomingMessage;
}

function makeCtx() {
  return { logEvent: jest.fn() };
}

beforeEach(() => {
  mockQueryOne.mockReset();
  mockExecute.mockReset();
  mockExecute.mockResolvedValue(1);
});

describe('edit-item-instance action', () => {
  describe('matches()', () => {
    it('matches PATCH on /api/items/:uuid/instance', () => {
      expect(action.matches('/api/items/some-uuid/instance', 'PATCH')).toBe(true);
      expect(action.matches('/api/items/abc-123/instance', 'PATCH')).toBe(true);
    });

    it('does not match other methods on /api/items/:uuid/instance', () => {
      expect(action.matches('/api/items/some-uuid/instance', 'GET')).toBe(false);
      expect(action.matches('/api/items/some-uuid/instance', 'POST')).toBe(false);
      expect(action.matches('/api/items/some-uuid/instance', 'PUT')).toBe(false);
      expect(action.matches('/api/items/some-uuid/instance', 'DELETE')).toBe(false);
    });

    it('does not match unrelated paths', () => {
      expect(action.matches('/api/items/some-uuid', 'PATCH')).toBe(false);
      expect(action.matches('/api/items/some-uuid/attachments', 'PATCH')).toBe(false);
      expect(action.matches('/api/items', 'PATCH')).toBe(false);
    });
  });

  describe('handle()', () => {
    it('returns 404 when item does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = makeCtx();
      const req = makeRequest('/api/items/no-such-uuid/instance', 'PATCH', { actor: 'tester', SerialNumber: 'SN123' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toBe('item not found');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when actor is missing', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { SerialNumber: 'SN123' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toBe('actor is required');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when no editable fields are provided', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toBe('no editable fields provided');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('updates SerialNumber only and logs InstanceUpdated', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', SerialNumber: 'SN-001' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        Actor: 'tester',
        EntityType: 'Item',
        EntityId: 'test-uuid',
        Event: 'InstanceUpdated'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.SerialNumber).toBe('SN-001');
      expect(meta.MacAddress).toBeUndefined();
      expect(meta.Quality).toBeUndefined();
    });

    it('updates MacAddress only and logs InstanceUpdated', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', MacAddress: 'AA:BB:CC:DD:EE:FF' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.MacAddress).toBe('AA:BB:CC:DD:EE:FF');
      expect(meta.SerialNumber).toBeUndefined();
    });

    it('updates Quality only and logs InstanceUpdated', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', Quality: 4 });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.Quality).toBe(4);
      expect(meta.SerialNumber).toBeUndefined();
    });

    it('updates all three fields at once', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', {
        actor: 'tester',
        SerialNumber: 'SN-X',
        MacAddress: '00:11:22:33:44:55',
        Quality: 3
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.SerialNumber).toBe('SN-X');
      expect(meta.MacAddress).toBe('00:11:22:33:44:55');
      expect(meta.Quality).toBe(3);
    });

    it('trims whitespace from SerialNumber and stores null for empty string', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', SerialNumber: '   ' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.SerialNumber).toBeNull();
    });

    it('clamps Quality to QUALITY_MAX (5) via normalizeQuality when out of range high', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', Quality: 99 });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      // normalizeQuality clamps to 1-5; values above 5 are clamped to 5
      expect(meta.Quality).toBe(5);
    });

    it('includes UpdatedAt in the SQL SET clause', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = makeCtx();
      const req = makeRequest('/api/items/test-uuid/instance', 'PATCH', { actor: 'tester', Quality: 2 });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(mockExecute).toHaveBeenCalled();
      const sql: string = mockExecute.mock.calls[0][0];
      expect(sql).toContain('UpdatedAt=');
    });
  });
});
