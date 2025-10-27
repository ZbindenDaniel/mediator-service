import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';

type MockFn = ReturnType<typeof jest.fn>;

type ImportContext = {
  db: { transaction: <T extends (...args: any[]) => any>(fn: T) => T };
  getItem: { get: MockFn };
  getItemReference: { get: MockFn };
  getAgenticRun: { get: MockFn };
  getBox: { get: MockFn };
  upsertBox: { run: MockFn };
  persistItemWithinTransaction: MockFn;
  upsertAgenticRun: { run: MockFn };
  logEvent: MockFn;
  agenticServiceEnabled: boolean;
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

function createRequest(
  body: string,
  options: { url?: string } = {}
): Readable & { method: string; headers: Record<string, string>; url?: string } {
  const stream = Readable.from([body]);
  (stream as any).method = 'POST';
  (stream as any).headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (options.url) {
    (stream as any).url = options.url;
  }
  return stream as Readable & { method: string; headers: Record<string, string>; url?: string };
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
    db: {
      transaction: ((fn: (...args: any[]) => any) => fn) as any
    },
    getItem: { get: jest.fn(() => undefined) },
    getItemReference: { get: jest.fn(() => null) },
    getAgenticRun: { get: jest.fn(() => undefined) },
    getBox: { get: jest.fn(() => undefined) },
    upsertBox: { run: jest.fn() },
    persistItemWithinTransaction: jest.fn(),
    upsertAgenticRun: { run: jest.fn() },
    logEvent: jest.fn(),
    agenticServiceEnabled: false
  };

  return { ...ctx, ...overrides };
}

describe('import-item ItemUUID behavior', () => {
  test('falls back to new item creation when Artikel_Nummer reference is missing', async () => {
    const ctx = createContext({
      getItemReference: { get: jest.fn(() => undefined) }
    });

    const form = new URLSearchParams({
      actor: 'regression-tester',
      Artikel_Nummer: 'A-NEW-4711',
      Artikelbeschreibung: 'Regression tracked item',
      Kurzbeschreibung: 'Kurztext'
    });

    const req = createRequest(form.toString(), { url: '/api/import/item' });
    const res = createResponse();

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    let infoCalls: any[][] = [];
    let warnCalls: any[][] = [];
    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
      infoCalls = infoSpy.mock.calls.slice();
      warnCalls = warnSpy.mock.calls.slice();
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);

    const payload = res.body ? JSON.parse(res.body) : null;
    expect(payload?.ok).toBe(true);
    expect(payload?.item?.ItemUUID).toBeDefined();

    expect(ctx.getItemReference.get).toHaveBeenCalledWith('A-NEW-4711');
    expect(ctx.persistItemWithinTransaction).toHaveBeenCalledTimes(1);

    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0][0];
    expect(persistedItem.Artikel_Nummer).toBe('A-NEW-4711');
    expect(persistedItem.Artikelbeschreibung).toBe('Regression tracked item');
    expect(persistedItem.__skipReferencePersistence).toBeUndefined();

    const creationLog = infoCalls.find(([message]) =>
      typeof message === 'string' && message.includes('Generated new ItemUUID for item import')
    );
    expect(creationLog).toBeDefined();
    expect(creationLog?.[1]?.Artikel_Nummer).toBe('A-NEW-4711');

    const fallbackWarnLogged = warnCalls.some(([message]) =>
      typeof message === 'string' && message.includes('No item reference found for creation-by-reference request')
    );
    expect(fallbackWarnLogged).toBe(true);
  });
});
