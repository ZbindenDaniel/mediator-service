import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';

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
  test('deduplicates AgenticSearchQueued events when status remains queued', async () => {
    const itemUUID = 'I-240101-0002';
    const boxId = 'B-240101-0002';
    const getAgenticRunMock = jest.fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ Status: 'queued' });
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
      Status: 'queued',
      QueuedLocally: true,
      RemoteTriggerDispatched: false
    });
  });
});
