import type { IncomingMessage, ServerResponse } from 'http';

const mockTransactionClient = { query: jest.fn().mockResolvedValue([]) };

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn(mockTransactionClient)),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

import action from '../catalog-spare-part';
import * as dbClient from '../../db-client';

const mockQuery = dbClient.query as jest.Mock;
const mockWithTransaction = dbClient.withTransaction as jest.Mock;

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

const parentItem = { ItemUUID: 'P-001', Artikel_Nummer: 'ART-001', Bezeichnung: 'Lenovo T430' };

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    getItem: jest.fn(async () => parentItem),
    generateItemUUID: jest.fn(async () => 'SPARE-001'),
    logEvent: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockWithTransaction.mockReset();
  mockQuery.mockResolvedValue([]);
  mockWithTransaction.mockImplementation(async (fn: (client: any) => Promise<any>) => fn(mockTransactionClient));
  mockTransactionClient.query.mockReset();
  mockTransactionClient.query.mockResolvedValue([]);
});

describe('catalog-spare-part action', () => {
  describe('matches()', () => {
    it('matches GET /spare-parts', () => {
      expect(action.matches('/api/items/some-uuid/spare-parts', 'GET')).toBe(true);
    });
    it('matches POST /spare-parts', () => {
      expect(action.matches('/api/items/some-uuid/spare-parts', 'POST')).toBe(true);
    });
    it('matches DELETE /spare-part-link', () => {
      expect(action.matches('/api/items/some-uuid/spare-part-link', 'DELETE')).toBe(true);
    });
    it('does not match unrelated paths', () => {
      expect(action.matches('/api/items/some-uuid/relations', 'GET')).toBe(false);
      expect(action.matches('/api/items/some-uuid/spare-parts', 'DELETE')).toBe(false);
      expect(action.matches('/api/items/some-uuid/spare-part-link', 'GET')).toBe(false);
    });
  });

  describe('GET /spare-parts', () => {
    it('returns spare parts list', async () => {
      const parts = [{ ItemUUID: 'FAN-001', slotKey: 'fan', Artikel_Nummer: 'FAN-ART', BoxID: null, Location: 'Lenovo T430' }];
      mockQuery.mockResolvedValue(parts);
      const ctx = makeCtx();
      const req = makeRequest('/api/items/P-001/spare-parts', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().spareParts).toHaveLength(1);
      expect(getBody().spareParts[0].ItemUUID).toBe('FAN-001');
    });

    it('returns empty array when no spare parts exist', async () => {
      mockQuery.mockResolvedValue([]);
      const ctx = makeCtx();
      const req = makeRequest('/api/items/P-001/spare-parts', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().spareParts).toEqual([]);
    });
  });

  describe('POST /spare-parts (catalog new spare part)', () => {
    it('creates spare part and returns 201 with itemUUID', async () => {
      const ctx = makeCtx({
        getItem: jest.fn()
          .mockResolvedValueOnce(parentItem)   // parent lookup
          .mockResolvedValueOnce(null),         // UUID uniqueness check
      });
      const req = makeRequest('/api/items/P-001/spare-parts', 'POST', {
        artikelNummer: 'FAN-ART',
        actor: 'alice',
        slotKey: 'fan',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(201);
      expect(getBody().itemUUID).toBe('SPARE-001');
      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('logs SparePartCataloged event with correct fields', async () => {
      const ctx = makeCtx({
        getItem: jest.fn()
          .mockResolvedValueOnce(parentItem)
          .mockResolvedValueOnce(null),
      });
      const req = makeRequest('/api/items/P-001/spare-parts', 'POST', {
        artikelNummer: 'FAN-ART',
        actor: 'alice',
        slotKey: 'fan',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        Actor: 'alice',
        EntityType: 'Item',
        EntityId: 'P-001',
        Event: 'SparePartCataloged',
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.childItemUUID).toBe('SPARE-001');
      expect(meta.artikelNummer).toBe('FAN-ART');
      expect(meta.slotKey).toBe('fan');
    });

    it('returns 400 when artikelNummer is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/P-001/spare-parts', 'POST', { actor: 'alice' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toMatch(/artikelNummer/);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when actor is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/P-001/spare-parts', 'POST', { artikelNummer: 'FAN-ART' });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toMatch(/actor/);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when parent item does not exist', async () => {
      const ctx = makeCtx({ getItem: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/MISSING/spare-parts', 'POST', {
        artikelNummer: 'FAN-ART',
        actor: 'alice',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toMatch(/parent item not found/);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('slotKey is optional and stored as null when omitted', async () => {
      const ctx = makeCtx({
        getItem: jest.fn()
          .mockResolvedValueOnce(parentItem)
          .mockResolvedValueOnce(null),
      });
      const req = makeRequest('/api/items/P-001/spare-parts', 'POST', {
        artikelNummer: 'FAN-ART',
        actor: 'alice',
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(201);
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.slotKey).toBeNull();
    });
  });

  describe('DELETE /spare-part-link', () => {
    it('deletes relation and item, returns 200', async () => {
      const ctx = makeCtx({
        getItem: jest.fn().mockResolvedValue({ ItemUUID: 'FAN-001', BoxID: null }),
      });
      const req = makeRequest('/api/items/FAN-001/spare-part-link', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when item not found', async () => {
      const ctx = makeCtx({ getItem: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/MISSING/spare-part-link', 'DELETE');
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });

    it('returns 409 when item has already been removed from device (BoxID set)', async () => {
      const ctx = makeCtx({
        getItem: jest.fn().mockResolvedValue({ ItemUUID: 'FAN-001', BoxID: 'B-042' }),
      });
      const req = makeRequest('/api/items/FAN-001/spare-part-link', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(409);
      expect(getBody().error).toMatch(/entnommen/);
      expect(mockWithTransaction).not.toHaveBeenCalled();
    });
  });
});
