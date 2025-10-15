import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';

type ImportContext = {
  getMaxBoxId: { get: () => { BoxID: string } | undefined };
  getMaxItemId: { get: () => { ItemUUID: string } | undefined };
  getBox: { get: (id: string) => unknown };
  db: { transaction: <T extends (...args: any[]) => any>(fn: T) => T };
  upsertBox: { run: jest.Mock };
  persistItemWithinTransaction: jest.Mock;
  upsertAgenticRun: { run: jest.Mock };
  logEvent: { run: jest.Mock };
  agenticServiceEnabled: boolean;
};

type ResponseShape = {
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

function createResponse(): ResponseShape {
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
    db: {
      transaction: (fn) => fn
    },
    upsertBox: { run: jest.fn() },
    persistItemWithinTransaction: jest.fn(),
    upsertAgenticRun: { run: jest.fn() },
    logEvent: { run: jest.fn() },
    agenticServiceEnabled: true
  };

  return { ...ctx, ...overrides };
}

describe('import-item agentic persistence with disabled agentic service', () => {
  test('persists queued agentic run and logs local queue when remote trigger is skipped', async () => {
    const ctx = createContext({ agenticServiceEnabled: false });
    const form = new URLSearchParams({
      actor: 'importer',
      BoxID: 'B-240101-0002',
      ItemUUID: 'I-240101-0002',
      Artikelbeschreibung: 'Lokaler Import Artikel',
      agenticSearch: 'Lokale Suche',
      Location: 'A-01-01'
    });
    const req = createRequest(form.toString());
    const res = createResponse();

    const infoSpy = jest.spyOn(console, 'info');

    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      infoSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);

    expect(ctx.upsertAgenticRun.run).toHaveBeenCalled();
    const persistedRun = ctx.upsertAgenticRun.run.mock.calls[0][0];
    expect(persistedRun.ItemUUID).toBe('I-240101-0002');
    expect(persistedRun.Status).toBe('queued');

    const agenticEventCall = ctx.logEvent.run.mock.calls.find(([payload]) => payload?.Event === 'AgenticSearchQueued');
    expect(agenticEventCall).toBeDefined();
    const meta = agenticEventCall ? JSON.parse(agenticEventCall[0].Meta) : null;
    expect(meta).toEqual({
      SearchQuery: 'Lokale Suche',
      Status: 'queued',
      QueuedLocally: true,
      RemoteTriggerDispatched: false
    });

    const loggedLocalQueue = infoSpy.mock.calls.some(([message]) =>
      typeof message === 'string' && message.includes('queued agentic run locally')
    );
    expect(loggedLocalQueue).toBe(true);
  });
});
