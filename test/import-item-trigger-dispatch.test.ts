import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';
import * as agenticTrigger from '../backend/actions/agentic-trigger';

type ImportContext = {
  getMaxBoxId: { get: () => { BoxID: string } };
  getMaxItemId: { get: () => { ItemUUID: string } };
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
  ended: boolean;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

function createRequest(body: string): Readable & { method: string; headers: Record<string, string> } {
  const stream = Readable.from([body]);
  stream.method = 'POST';
  stream.headers = { 'content-type': 'application/x-www-form-urlencoded' };
  return stream as Readable & { method: string; headers: Record<string, string> };
}

function createResponse(): ResponseShape {
  const chunks: Buffer[] = [];
  return {
    statusCode: 0,
    headers: {},
    ended: false,
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
      this.ended = true;
    }
  };
}

function createContext(overrides: Partial<ImportContext> = {}): ImportContext {
  const ctx: ImportContext = {
    getMaxBoxId: { get: () => ({ BoxID: 'B-010101-0001' }) },
    getMaxItemId: { get: () => ({ ItemUUID: 'I-010101-0001' }) },
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

describe('import-item agentic trigger dispatch', () => {
  function createForm(overrides: Record<string, string> = {}): URLSearchParams {
    return new URLSearchParams({
      actor: 'importer',
      BoxID: 'B-240101-0001',
      ItemUUID: 'I-240101-0001',
      Artikelbeschreibung: 'Asynchroner Artikel',
      agenticSearch: 'Asynchroner Artikel Suche',
      Location: 'A-01-01',
      ...overrides
    });
  }

  it('responds immediately even when the agentic trigger promise is slow', async () => {
    const triggerSpy = jest.spyOn(agenticTrigger, 'forwardAgenticTrigger');
    let resolveTrigger: ((value: { ok: boolean; status: number }) => void) | undefined;
    let settled = false;

    triggerSpy.mockImplementation(() =>
      new Promise((resolve) => {
        resolveTrigger = (value) => {
          settled = true;
          resolve(value);
        };
      })
    );

    const ctx = createContext();
    const req = createRequest(createForm().toString());
    const res = createResponse();

    try {
      const handlerPromise = importItemAction.handle(req, res, ctx as any);

      await Promise.race([
        handlerPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('handler timeout')), 50))
      ]);

      expect(res.statusCode).toBe(200);
      expect(res.ended).toBe(true);
      expect(settled).toBe(false);
      expect(triggerSpy).toHaveBeenCalledTimes(1);
      expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(1);
      const persistedRun = ctx.upsertAgenticRun.run.mock.calls[0][0];
      expect(persistedRun.Status).toBe('queued');

      resolveTrigger?.({ ok: true, status: 202 });
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      triggerSpy.mockRestore();
    }
  });

  it('logs failures from asynchronous trigger dispatch without delaying the response', async () => {
    const triggerSpy = jest.spyOn(agenticTrigger, 'forwardAgenticTrigger');
    let rejectTrigger: ((error: Error) => void) | undefined;

    triggerSpy.mockImplementation(() =>
      new Promise((_, reject) => {
        rejectTrigger = reject;
      })
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const ctx = createContext();
    const req = createRequest(createForm({ ItemUUID: 'I-240101-0002' }).toString());
    const res = createResponse();

    try {
      const handlerPromise = importItemAction.handle(req, res, ctx as any);

      await Promise.race([
        handlerPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('handler timeout')), 50))
      ]);

      expect(res.statusCode).toBe(200);
      expect(res.ended).toBe(true);

      rejectTrigger?.(new Error('kaputt'));
      await new Promise((resolve) => setImmediate(resolve));

      const loggedFailure = errorSpy.mock.calls.some(([message]) =>
        typeof message === 'string' && message.includes('Failed to trigger agentic run after import')
      );
      expect(loggedFailure).toBe(true);
    } finally {
      triggerSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
