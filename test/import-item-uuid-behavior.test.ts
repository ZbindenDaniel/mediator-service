jest.mock('../backend/actions/agentic-trigger', () => ({
  forwardAgenticTrigger: jest.fn().mockResolvedValue({ ok: true, status: 202, body: null })
}));
jest.mock('../backend/lib/itemIds', () => ({
  generateItemUUID: jest.fn()
}));

import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';
import { generateItemUUID } from '../backend/lib/itemIds';

const generateItemUUIDMock = generateItemUUID as jest.Mock;

type ImportContext = {
  getItem: { get: jest.Mock };
  getBox: { get: jest.Mock };
  db: { transaction: <T extends (...args: any[]) => any>(fn: T) => T };
  upsertBox: { run: jest.Mock };
  persistItemWithinTransaction: jest.Mock;
  upsertAgenticRun: { run: jest.Mock };
  logEvent: jest.Mock;
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
    getItem: { get: jest.fn() },
    getBox: { get: jest.fn() },
    db: {
      transaction: ((fn: (...args: any[]) => any) => ((...args: any[]) => fn(...args))) as any
    },
    upsertBox: { run: jest.fn() },
    persistItemWithinTransaction: jest.fn(),
    upsertAgenticRun: { run: jest.fn() },
    logEvent: jest.fn(),
    agenticServiceEnabled: false
  };

  return { ...ctx, ...overrides };
}

describe('import-item ItemUUID handling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    generateItemUUIDMock.mockReset();
  });

  test('generates a fresh ItemUUID when incoming payload references a different item', async () => {
    const systemTime = new Date('2024-04-05T10:30:00Z');
    jest.useFakeTimers().setSystemTime(systemTime);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx = createContext({
      getItem: { get: jest.fn().mockReturnValue(undefined) }
    });

    generateItemUUIDMock.mockReturnValueOnce('I-minted-uuid-0001');

    const form = new URLSearchParams({
      actor: 'creator',
      ItemUUID: 'I-REFERENCE-1234',
      Artikelbeschreibung: 'Referenced item clone'
    });

    const req = createRequest(form.toString(), { url: '/api/import/item' });
    const res = createResponse();

    let infoCalls: any[][] = [];
    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      infoCalls = infoSpy.mock.calls.slice();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe('I-minted-uuid-0001');
    expect(payload?.item?.ItemUUID).not.toBe('I-REFERENCE-1234');

    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe('I-minted-uuid-0001');
    expect(generateItemUUIDMock).toHaveBeenCalledTimes(1);
    expect(
      infoCalls.some(([message]) =>
        typeof message === 'string' && message.includes('Discarding ItemUUID provided for new item import')
      )
    ).toBe(true);
  });

  test('preserves ItemUUID for existing items during updates', async () => {
    const systemTime = new Date('2024-04-05T11:15:00Z');
    jest.useFakeTimers().setSystemTime(systemTime);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const existingUUID = 'I-010124-0042';
    const ctx = createContext({
      getItem: { get: jest.fn().mockReturnValue({ ItemUUID: existingUUID }) }
    });

    const form = new URLSearchParams({
      actor: 'editor',
      ItemUUID: 'I-IGNORED-FROM-PAYLOAD',
      Artikelbeschreibung: 'Updated existing item'
    });

    const req = createRequest(form.toString(), { url: `/api/items/${encodeURIComponent(existingUUID)}` });
    const res = createResponse();

    let warnCalls: any[][] = [];
    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
      warnCalls = warnSpy.mock.calls.slice();
      warnSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe(existingUUID);

    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe(existingUUID);
    expect(generateItemUUIDMock).not.toHaveBeenCalled();
    expect(
      warnCalls.some(([message]) =>
        typeof message === 'string' && message.includes('Ignoring mismatched ItemUUID')
      )
    ).toBe(true);
  });
});
