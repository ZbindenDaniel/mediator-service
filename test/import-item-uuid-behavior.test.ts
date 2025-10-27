jest.mock('../backend/actions/agentic-trigger', () => ({
  forwardAgenticTrigger: jest.fn().mockResolvedValue({ ok: true, status: 202, body: null })
}));

import { Readable } from 'stream';
import importItemAction from '../backend/actions/import-item';

type ImportContext = {
  getMaxItemId: { get: () => { ItemUUID: string } | undefined };
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
    getMaxItemId: { get: () => ({ ItemUUID: 'I-010124-0001' }) },
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
  });

  test('generates a fresh ItemUUID when incoming payload references a different item', async () => {
    const systemTime = new Date('2024-04-05T10:30:00Z');
    jest.useFakeTimers().setSystemTime(systemTime);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const ctx = createContext({
      getMaxItemId: { get: () => ({ ItemUUID: 'I-050424-0007' }) },
      getItem: { get: jest.fn().mockReturnValue(undefined) }
    });

    const form = new URLSearchParams({
      actor: 'creator',
      ItemUUID: 'I-REFERENCE-1234',
      Artikelbeschreibung: 'Referenced item clone'
    });

    const req = createRequest(form.toString());
    const res = createResponse();

    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe('I-050424-0008');
    expect(payload?.item?.ItemUUID).not.toBe('I-REFERENCE-1234');

    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe('I-050424-0008');
  });

  test('preserves ItemUUID for existing items during updates', async () => {
    const systemTime = new Date('2024-04-05T11:15:00Z');
    jest.useFakeTimers().setSystemTime(systemTime);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const existingUUID = 'I-010124-0042';
    const ctx = createContext({
      getItem: { get: jest.fn().mockReturnValue({ ItemUUID: existingUUID }) }
    });

    const form = new URLSearchParams({
      actor: 'editor',
      ItemUUID: existingUUID,
      Artikelbeschreibung: 'Updated existing item'
    });

    const req = createRequest(form.toString());
    const res = createResponse();

    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe(existingUUID);

    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe(existingUUID);
  });
});
