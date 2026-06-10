import type { IncomingMessage, ServerResponse } from 'http';
import action from '../user-marks';

// Mock the db module so tests don't need a real SQLite file.
jest.mock('../../db', () => ({
  getUserMarks: jest.fn(),
  markItem: jest.fn(),
  unmarkItem: jest.fn(),
  getUserMark: jest.fn()
}));

import { getUserMarks, markItem, unmarkItem, getUserMark } from '../../db';

const mockedGetUserMarks = getUserMarks as jest.MockedFunction<typeof getUserMarks>;
const mockedMarkItem = markItem as jest.MockedFunction<typeof markItem>;
const mockedUnmarkItem = unmarkItem as jest.MockedFunction<typeof unmarkItem>;
const mockedGetUserMark = getUserMark as jest.MockedFunction<typeof getUserMark>;

function makeGetReq(url: string): IncomingMessage {
  return { method: 'GET', url, async *[Symbol.asyncIterator]() {} } as IncomingMessage;
}

function makeBodyReq(method: string, url: string, body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() { yield Buffer.from(payload); }
  } as IncomingMessage;
}

function makeRes() {
  let statusCode = 0;
  let body = '';
  return {
    writeHead: jest.fn(function (this: any, status: number) { statusCode = status; return this; }),
    end: jest.fn(function (this: any, payload: string) { body = payload; return this; }),
    getStatus: () => statusCode,
    getBody: () => JSON.parse(body)
  };
}

describe('user-marks action', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('matches()', () => {
    it('matches GET /api/user-marks', () => {
      expect(action.matches('/api/user-marks', 'GET')).toBe(true);
    });
    it('matches POST /api/user-marks', () => {
      expect(action.matches('/api/user-marks', 'POST')).toBe(true);
    });
    it('matches DELETE /api/user-marks', () => {
      expect(action.matches('/api/user-marks', 'DELETE')).toBe(true);
    });
    it('does not match other paths', () => {
      expect(action.matches('/api/items', 'GET')).toBe(false);
    });
  });

  describe('GET /api/user-marks', () => {
    it('returns 400 when username is missing', async () => {
      const res = makeRes();
      await action.handle(makeGetReq('/api/user-marks') as any, res as any, {} as any);
      expect(res.getStatus()).toBe(400);
    });

    it('returns empty marks for unknown user', async () => {
      mockedGetUserMarks.mockReturnValue([]);
      const res = makeRes();
      await action.handle(makeGetReq('/api/user-marks?username=nobody') as any, res as any, {} as any);
      expect(res.getStatus()).toBe(200);
      const body = res.getBody();
      expect(body.markedUUIDs).toEqual([]);
      expect(body.marks).toEqual([]);
    });

    it('returns marks and notes for a known user', async () => {
      mockedGetUserMarks.mockReturnValue([
        { ItemUUID: 'uuid-1', Note: 'check price' },
        { ItemUUID: 'uuid-2', Note: null }
      ]);
      const res = makeRes();
      await action.handle(makeGetReq('/api/user-marks?username=alice') as any, res as any, {} as any);
      expect(res.getStatus()).toBe(200);
      const body = res.getBody();
      expect(body.markedUUIDs).toEqual(['uuid-1', 'uuid-2']);
      expect(body.marks).toEqual([
        { itemUUID: 'uuid-1', note: 'check price' },
        { itemUUID: 'uuid-2', note: null }
      ]);
    });
  });

  describe('POST /api/user-marks', () => {
    it('returns 400 when username or itemUUID is missing', async () => {
      const res = makeRes();
      await action.handle(makeBodyReq('POST', '/api/user-marks', { username: 'alice' }) as any, res as any, {} as any);
      expect(res.getStatus()).toBe(400);
    });

    it('calls markItem and returns saved note', async () => {
      mockedGetUserMark.mockReturnValue({ Note: 'inspect unit' });
      const res = makeRes();
      await action.handle(
        makeBodyReq('POST', '/api/user-marks', { username: 'alice', itemUUID: 'uuid-1', note: 'inspect unit' }) as any,
        res as any,
        {} as any
      );
      expect(mockedMarkItem).toHaveBeenCalledWith('alice', 'uuid-1', 'inspect unit');
      expect(res.getStatus()).toBe(200);
      expect(res.getBody()).toEqual({ ok: true, note: 'inspect unit' });
    });

    it('saves mark without note', async () => {
      mockedGetUserMark.mockReturnValue({ Note: null });
      const res = makeRes();
      await action.handle(
        makeBodyReq('POST', '/api/user-marks', { username: 'bob', itemUUID: 'uuid-2' }) as any,
        res as any,
        {} as any
      );
      expect(mockedMarkItem).toHaveBeenCalledWith('bob', 'uuid-2', null);
      expect(res.getBody().note).toBeNull();
    });
  });

  describe('DELETE /api/user-marks', () => {
    it('calls unmarkItem and returns ok', async () => {
      const res = makeRes();
      await action.handle(
        makeBodyReq('DELETE', '/api/user-marks', { username: 'alice', itemUUID: 'uuid-1' }) as any,
        res as any,
        {} as any
      );
      expect(mockedUnmarkItem).toHaveBeenCalledWith('alice', 'uuid-1');
      expect(res.getStatus()).toBe(200);
      expect(res.getBody()).toEqual({ ok: true });
    });

    it('is idempotent — succeeds even if mark did not exist', async () => {
      mockedUnmarkItem.mockImplementation(() => undefined);
      const res = makeRes();
      await action.handle(
        makeBodyReq('DELETE', '/api/user-marks', { username: 'alice', itemUUID: 'nonexistent' }) as any,
        res as any,
        {} as any
      );
      expect(res.getStatus()).toBe(200);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = makeRes();
      await action.handle(
        makeBodyReq('DELETE', '/api/user-marks', { username: 'alice' }) as any,
        res as any,
        {} as any
      );
      expect(res.getStatus()).toBe(400);
    });
  });
});
