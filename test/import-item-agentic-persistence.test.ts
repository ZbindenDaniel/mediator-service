jest.mock('../backend/actions/agentic-trigger', () => ({
  forwardAgenticTrigger: jest.fn().mockResolvedValue({ ok: true, status: 202, body: null })
}));

import { forwardAgenticTrigger } from '../backend/actions/agentic-trigger';
import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED
} from '../models';

type ImportContext = {
  getMaxBoxId: { get: () => { BoxID: string } | undefined };
  getMaxItemId: { get: () => { ItemUUID: string } | undefined };
  getBox: { get: (id: string) => unknown };
  getItem: { get: jest.Mock };
  getAgenticRun: { get: jest.Mock };
  db: { transaction: <T extends (...args: any[]) => any>(fn: T) => T };
  upsertBox: { run: jest.Mock };
  persistItemWithinTransaction: jest.Mock;
  upsertAgenticRun: { run: jest.Mock };
  logEvent: { run: jest.Mock };
  agenticServiceEnabled: boolean;
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

function createRequest(body: string): Readable & { method: string; headers: Record<string, string> } {
  const stream = Readable.from([body]);
  (stream as any).method = 'POST';
  (stream as any).headers = { 'content-type': 'application/x-www-form-urlencoded' };
  return stream as Readable & { method: string; headers: Record<string, string> };
}

function createResponse(): MockResponse {
  const chunks: Buffer[] = [];
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        this.body = Buffer.concat(chunks).toString('utf8');
      }
    }
  };
}

function createContext(overrides: Partial<ImportContext> = {}): ImportContext {
  const ctx: ImportContext = {
    getMaxBoxId: { get: () => ({ BoxID: 'B-240101-0001' }) },
    getMaxItemId: { get: () => ({ ItemUUID: 'I-240101-0001' }) },
    getBox: { get: () => undefined },
    getItem: { get: jest.fn() },
    getAgenticRun: { get: jest.fn() },
    db: {
      transaction: ((fn: (...args: any[]) => any) => ((...args: any[]) => fn(...args))) as any
    },
    upsertBox: { run: jest.fn() },
    persistItemWithinTransaction: jest.fn(),
    upsertAgenticRun: { run: jest.fn() },
    logEvent: { run: jest.fn() },
    agenticServiceEnabled: false
  };

  return { ...ctx, ...overrides };
}

describe('import-item agentic persistence', () => {
  beforeEach(() => {
    (forwardAgenticTrigger as jest.Mock).mockClear();
  });

  test('deduplicates AgenticSearchQueued events when status remains queued', async () => {
    const itemUUID = 'I-240101-0002';
    const boxId = 'B-240101-0002';
    const getAgenticRunMock = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ Status: AGENTIC_RUN_STATUS_QUEUED });
    const getItemMock = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ ItemUUID: itemUUID });

    const ctx = createContext({
      getMaxBoxId: { get: () => ({ BoxID: boxId }) },
      getMaxItemId: { get: () => ({ ItemUUID: itemUUID }) },
      getAgenticRun: { get: getAgenticRunMock },
      getItem: { get: getItemMock }
    });

    const form = new URLSearchParams({
      actor: 'importer',
      BoxID: boxId,
      ItemUUID: itemUUID,
      Artikelbeschreibung: 'Queue Persistence Item',
      agenticSearch: 'Persistent Query',
      Location: 'A-01-01'
    });

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const firstReq = createRequest(form.toString());
      const firstRes = createResponse();
      await importItemAction.handle(firstReq as any, firstRes as any, ctx as any);
      expect(firstRes.statusCode).toBe(200);

      const secondReq = createRequest(form.toString());
      const secondRes = createResponse();
      await importItemAction.handle(secondReq as any, secondRes as any, ctx as any);
      expect(secondRes.statusCode).toBe(200);
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(2);
    expect(getAgenticRunMock).toHaveBeenCalledTimes(2);

    const queuedEvents = ctx.logEvent.run.mock.calls.filter(([payload]) => payload?.Event === 'AgenticSearchQueued');
    expect(queuedEvents).toHaveLength(1);
    const queuedMeta = queuedEvents[0]?.[0]?.Meta ? JSON.parse(queuedEvents[0][0].Meta) : null;
    expect(queuedMeta).toEqual({
      SearchQuery: 'Persistent Query',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      QueuedLocally: true,
      RemoteTriggerDispatched: false
    });
  });

  test('skips agentic trigger and queue logging when status notStarted', async () => {
    const ctx = createContext({
      agenticServiceEnabled: true,
      getAgenticRun: { get: jest.fn() },
      getItem: { get: jest.fn() }
    });

    const form = new URLSearchParams({
      actor: 'manual-user',
      Artikelbeschreibung: 'Manual Only Item',
      agenticStatus: AGENTIC_RUN_STATUS_NOT_STARTED,
      agenticManualFallback: 'true'
    });

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const req = createRequest(form.toString());
      const res = createResponse();
      await importItemAction.handle(req as any, res as any, ctx as any);

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('"ok":true');
      const parsed = JSON.parse(res.body);
      expect(parsed.agenticTriggerDispatched).toBe(false);
    } finally {
      infoSpy.mockRestore();
    }

    const agenticQueuedEvents = ctx.logEvent.run.mock.calls.filter(([payload]) => payload?.Event === 'AgenticSearchQueued');
    expect(agenticQueuedEvents).toHaveLength(0);

    expect(ctx.logEvent.run).toHaveBeenCalledTimes(1);
    const [loggedEvent] = ctx.logEvent.run.mock.calls[0] ?? [];
    expect(loggedEvent?.Event).not.toBe('AgenticSearchQueued');

    expect(ctx.getAgenticRun.get).not.toHaveBeenCalled();

    expect(forwardAgenticTrigger).not.toHaveBeenCalled();

    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(1);
    const persistedRun = ctx.upsertAgenticRun.run.mock.calls[0]?.[0];
    expect(persistedRun).toMatchObject({ Status: AGENTIC_RUN_STATUS_NOT_STARTED });
  });

  test('forces agentic status to notStarted when manual fallback flag provided', async () => {
    const ctx = createContext({
      agenticServiceEnabled: true,
      getAgenticRun: { get: jest.fn() },
      getItem: { get: jest.fn() }
    });

    const form = new URLSearchParams({
      actor: 'manual-user',
      Artikelbeschreibung: 'Manual Fallback Item',
      agenticStatus: AGENTIC_RUN_STATUS_QUEUED,
      agenticManualFallback: 'true'
    });

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const req = createRequest(form.toString());
      const res = createResponse();
      await importItemAction.handle(req as any, res as any, ctx as any);

      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.agenticTriggerDispatched).toBe(false);
    } finally {
      infoSpy.mockRestore();
    }

    expect(forwardAgenticTrigger).not.toHaveBeenCalled();
    const persistedRun = ctx.upsertAgenticRun.run.mock.calls[0]?.[0];
    expect(persistedRun).toMatchObject({ Status: AGENTIC_RUN_STATUS_NOT_STARTED });
  });
});
