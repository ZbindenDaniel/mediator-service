// move-box uses withTransaction from db-client; mock it to capture query calls
jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: { query: jest.Mock }) => Promise<void>) => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    await fn(client);
    return client;
  }),
  query: jest.fn(async () => ({ rows: [] })),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import moveBoxAction from '../backend/actions/move-box';

const dbClient = require('../backend/db-client');

function createMockRequest(path: string, body: unknown): IncomingMessage {
  const stream = new Readable({ read() {} });
  stream.push(JSON.stringify(body));
  stream.push(null);
  (stream as IncomingMessage).url = path;
  (stream as IncomingMessage).method = 'POST';
  return stream as IncomingMessage;
}

function createMockResponse() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead(status: number, responseHeaders: Record<string, string>) {
      statusCode = status;
      headers = { ...responseHeaders };
      return res;
    },
    end(chunk?: unknown) {
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

function createMoveBoxContext(box: { BoxID: string; LocationId?: string | null; Notes?: string | null; Label?: string | null; PhotoPath?: string | null; Color?: string | null }) {
  const logEvent = jest.fn(async () => undefined);
  const ctx = {
    getBox: jest.fn(async (id: string) => id === box.BoxID ? { ...box, PhotoPath: box.PhotoPath ?? null } : null),
    logEvent
  };
  return { ctx, logEvent };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('move-box action note updates', () => {
  test('updates notes without requiring location', async () => {
    const { ctx, logEvent } = createMoveBoxContext({ BoxID: 'BOX-001', LocationId: null });
    const req = createMockRequest('/api/boxes/BOX-001/move', { actor: 'Tester', notes: '  Hello Note  ' });
    const { res, getStatus, getBody } = createMockResponse();

    // Capture the client.query mock from inside withTransaction
    let capturedQueryArgs: unknown[][] = [];
    dbClient.withTransaction.mockImplementationOnce(async (fn: (client: { query: jest.Mock }) => Promise<void>) => {
      const client = {
        query: jest.fn(async (...args: unknown[]) => {
          capturedQueryArgs.push(args);
          return { rows: [] };
        })
      };
      await fn(client);
    });

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(getStatus()).toBe(200);
    expect(JSON.parse(getBody())).toEqual({ ok: true, photoPath: null, color: null });

    // Notes UPDATE was executed with trimmed notes
    expect(capturedQueryArgs.length).toBeGreaterThan(0);
    const updateCall = capturedQueryArgs[0] as [string, unknown[]];
    expect(updateCall[0]).toContain('UPDATE boxes');
    expect(updateCall[1]).toContain('Hello Note');

    // logEvent called with Note event
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        Event: 'Note',
        EntityId: 'BOX-001',
        Actor: 'Tester'
      })
    );
  });

  test('moves box placement when location provided', async () => {
    const { ctx, logEvent } = createMoveBoxContext({ BoxID: 'BOX-002', LocationId: 'A-01-01', Notes: 'Old', Label: 'Rot' });
    const req = createMockRequest('/api/boxes/BOX-002/move', {
      actor: 'Mover',
      LocationId: 'b-02-03',
      notes: 'Moved note',
      Label: 'Orange'
    });
    const { res, getStatus, getBody } = createMockResponse();

    let capturedQueryArgs: unknown[][] = [];
    dbClient.withTransaction.mockImplementationOnce(async (fn: (client: { query: jest.Mock }) => Promise<void>) => {
      const client = {
        query: jest.fn(async (...args: unknown[]) => {
          capturedQueryArgs.push(args);
          return { rows: [] };
        })
      };
      await fn(client);
    });

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(getStatus()).toBe(200);
    expect(JSON.parse(getBody())).toEqual({ ok: true, photoPath: null, color: null });

    // UPDATE was executed with uppercased locationId
    expect(capturedQueryArgs.length).toBeGreaterThan(0);
    const updateCall = capturedQueryArgs[0] as [string, unknown[]];
    expect(updateCall[0]).toContain('UPDATE boxes');
    expect(updateCall[1]).toContain('B-02-03');
    expect(updateCall[1]).toContain('Moved note');

    // logEvent called with Moved event, correct metadata
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        Event: 'Moved',
        EntityId: 'BOX-002',
        Actor: 'Mover'
      })
    );
    const logArgs = logEvent.mock.calls[0][0] as { Meta?: string };
    expect(JSON.parse(logArgs.Meta || '{}')).toMatchObject({
      locationId: 'B-02-03',
      notes: 'Moved note'
    });
  });
});

describe('move-box action shelf color', () => {
  function captureQueries(): unknown[][] {
    const captured: unknown[][] = [];
    dbClient.withTransaction.mockImplementationOnce(async (fn: (client: { query: jest.Mock }) => Promise<void>) => {
      const client = {
        query: jest.fn(async (...args: unknown[]) => {
          captured.push(args);
          return { rows: [] };
        })
      };
      await fn(client);
    });
    return captured;
  }

  test('persists a normalized color from the shelf details form', async () => {
    const { ctx } = createMoveBoxContext({ BoxID: 'S-1-1-1', LocationId: null });
    const req = createMockRequest('/api/boxes/S-1-1-1/move', { actor: 'Tester', Label: 'Regal', notes: '', color: '#AABBCC' });
    const { res, getStatus, getBody } = createMockResponse();
    const captured = captureQueries();

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(getStatus()).toBe(200);
    expect(JSON.parse(getBody())).toMatchObject({ ok: true, color: '#aabbcc' });
    const [sql, params] = captured[0] as [string, unknown[]];
    expect(sql).toContain('"Color"=');
    expect(params).toContain('#aabbcc');
  });

  test('keeps the existing color when the payload omits it', async () => {
    const { ctx } = createMoveBoxContext({ BoxID: 'S-1-1-2', LocationId: null, Color: '#112233' });
    const req = createMockRequest('/api/boxes/S-1-1-2/move', { actor: 'Tester', notes: 'only notes' });
    const { res, getStatus } = createMockResponse();
    const captured = captureQueries();

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(getStatus()).toBe(200);
    expect((captured[0] as [string, unknown[]])[1]).toContain('#112233');
  });

  test('clears the color on empty string', async () => {
    const { ctx } = createMoveBoxContext({ BoxID: 'S-1-1-3', LocationId: null, Color: '#112233' });
    const req = createMockRequest('/api/boxes/S-1-1-3/move', { actor: 'Tester', notes: '', color: '' });
    const { res, getBody } = createMockResponse();
    const captured = captureQueries();

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(JSON.parse(getBody())).toMatchObject({ ok: true, color: null });
    expect((captured[0] as [string, unknown[]])[1]).not.toContain('#112233');
  });

  test('rejects anything that is not #rrggbb', async () => {
    const { ctx } = createMoveBoxContext({ BoxID: 'S-1-1-4', LocationId: null });
    const req = createMockRequest('/api/boxes/S-1-1-4/move', { actor: 'Tester', color: 'red; background:url(x)' });
    const { res, getStatus } = createMockResponse();

    await moveBoxAction.handle?.(req, res, ctx as any);

    expect(getStatus()).toBe(400);
    expect(dbClient.withTransaction).not.toHaveBeenCalled();
  });
});
