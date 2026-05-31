import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn({})),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  insert: jest.fn(async () => ({})),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 0),
  execBatch: jest.fn(async () => undefined),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

import action from '../item-attachments';
import * as dbClient from '../../db-client';

const mockQueryOne = dbClient.queryOne as jest.Mock;
const mockQuery = dbClient.query as jest.Mock;
const mockExecute = dbClient.execute as jest.Mock;
const mockInsert = dbClient.insert as jest.Mock;

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: Buffer
): IncomingMessage {
  const req: any = { url, method, headers };
  if (body) {
    req[Symbol.asyncIterator] = async function* () { yield body; };
  } else {
    req[Symbol.asyncIterator] = async function* () {};
  }
  return req as IncomingMessage;
}

beforeEach(() => {
  mockQueryOne.mockReset();
  mockQuery.mockReset();
  mockExecute.mockReset();
  mockInsert.mockReset();
  mockQueryOne.mockResolvedValue(null);
  mockQuery.mockResolvedValue([]);
  mockExecute.mockResolvedValue(0);
  mockInsert.mockResolvedValue({ Id: 1 });
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
});

afterEach(() => {
  // spies are reset in beforeEach; restoreAllMocks not available in custom harness
});

describe('item-attachments action', () => {
  describe('matches()', () => {
    it('matches GET, POST, DELETE on /api/item/:uuid/attachments', () => {
      expect(action.matches('/api/item/test-uuid/attachments', 'GET')).toBe(true);
      expect(action.matches('/api/item/test-uuid/attachments', 'POST')).toBe(true);
      expect(action.matches('/api/item/test-uuid/attachments', 'DELETE')).toBe(true);
    });

    it('matches DELETE on /api/item/:uuid/attachments/:id', () => {
      expect(action.matches('/api/item/test-uuid/attachments/1', 'DELETE')).toBe(true);
    });

    it('does not match unrelated routes', () => {
      expect(action.matches('/api/items/test-uuid', 'GET')).toBe(false);
      expect(action.matches('/api/item/test-uuid/attachments', 'PUT')).toBe(false);
    });
  });

  describe('GET', () => {
    it('returns 404 when item does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/no-such-uuid/attachments', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toBe('item not found');
    });

    it('returns attachment list for existing item', async () => {
      const attachments = [
        { Id: 1, FileName: 'doc.pdf', FilePath: 'instances/test-uuid/doc.pdf', MimeType: 'application/pdf', Label: null, FileSize: 1024, CreatedAt: '2024-01-01' }
      ];
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      mockQuery.mockResolvedValue(attachments);
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().attachments).toHaveLength(1);
      expect(getBody().attachments[0].FileName).toBe('doc.pdf');
    });

    it('returns empty list when item has no attachments', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      mockQuery.mockResolvedValue([]);
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().attachments).toEqual([]);
    });
  });

  describe('POST', () => {
    it('logs AttachmentAdded and returns 201 on successful upload', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      mockInsert.mockResolvedValue({ Id: 1 });
      const ctx = { logEvent: jest.fn() };
      const fileData = Buffer.from('file contents here');
      const req = makeRequest('/api/item/test-uuid/attachments', 'POST', {
        'x-filename': 'document.pdf',
        'content-type': 'application/pdf'
      }, fileData);
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(201);
      expect(getBody().ok).toBe(true);
      expect(getBody().fileName).toBe('document.pdf');
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        EntityType: 'Item',
        EntityId: 'test-uuid',
        Event: 'AttachmentAdded'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.fileName).toBe('document.pdf');
      expect(meta.mimeType).toBe('application/pdf');
      expect(meta.fileSize).toBe(fileData.length);
    });

    it('records optional label in Meta when X-Label header is provided', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'POST', {
        'x-filename': 'photo.jpg',
        'content-type': 'image/jpeg',
        'x-label': 'Front view'
      }, Buffer.from('img'));
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(ctx.logEvent).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when X-Filename header is missing', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'POST', {
        'content-type': 'application/pdf'
      }, Buffer.from('data'));
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toBe('X-Filename header is required');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when file body is empty', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'POST', {
        'x-filename': 'empty.pdf',
        'content-type': 'application/pdf'
      }); // no body buffer
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toBe('empty file body');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when item does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/no-such-uuid/attachments', 'POST', {
        'x-filename': 'file.pdf',
        'content-type': 'application/pdf'
      }, Buffer.from('data'));
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('sanitises filename by replacing unsafe characters', async () => {
      mockQueryOne.mockResolvedValue({ ItemUUID: 'test-uuid' });
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments', 'POST', {
        'x-filename': 'my file (1).pdf',
        'content-type': 'application/pdf'
      }, Buffer.from('data'));
      const { res, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      // spaces and parens replaced with underscores
      expect(getBody().fileName).toBe('my_file__1_.pdf');
    });
  });

  describe('DELETE', () => {
    it('logs AttachmentRemoved and returns 200 on successful deletion', async () => {
      mockQueryOne.mockResolvedValue({ Id: 1, FileName: 'old.pdf', FilePath: 'instances/test-uuid/old.pdf' });
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments/1', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        EntityType: 'Item',
        EntityId: 'test-uuid',
        Event: 'AttachmentRemoved'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.fileName).toBe('old.pdf');
    });

    it('returns 404 when attachment does not exist', async () => {
      // First queryOne = item exists; second queryOne = attachment not found
      mockQueryOne
        .mockReturnValueOnce(Promise.resolve({ ItemUUID: 'test-uuid' }))
        .mockReturnValueOnce(Promise.resolve(null));
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments/99', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toBe('attachment not found');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when item does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/no-item/attachments/1', 'DELETE');
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('still completes deletion even when file is already gone from disk', async () => {
      mockQueryOne.mockResolvedValue({ Id: 1, FileName: 'gone.pdf', FilePath: 'instances/test-uuid/gone.pdf' });
      // Override the unlinkSync spy set in beforeEach to throw
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => { throw new Error('ENOENT'); });

      const ctx = { logEvent: jest.fn() };
      const req = makeRequest('/api/item/test-uuid/attachments/1', 'DELETE');
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({ Event: 'AttachmentRemoved' }));
    });
  });
});
