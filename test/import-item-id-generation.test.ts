import { Readable } from 'stream';
import * as crypto from 'crypto';
import importItemAction from '../backend/actions/import-item';
import { ItemEinheit } from '../models';

type ImportContext = {
  getItem: { get: jest.Mock };
  getBox: { get: jest.Mock };
  getItemReference: { get: jest.Mock };
  getAgenticRun: { get: jest.Mock };
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
    getItemReference: { get: jest.fn() },
    getAgenticRun: { get: jest.fn() },
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

describe('import-item ItemUUID minting', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mints a new ItemUUID without relying on getMaxItemId', async () => {
    const randomSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('minted-uuid' as any);
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ctx = createContext({
      getItem: { get: jest.fn().mockReturnValue(undefined) }
    });

    const form = new URLSearchParams({
      actor: 'creator',
      Artikelbeschreibung: 'Minted item description'
    });

    const req = createRequest(form.toString(), { url: '/api/import/item' });
    const res = createResponse();

    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      randomSpy.mockRestore();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe('I-minted-uuid');

    expect(ctx.persistItemWithinTransaction).toHaveBeenCalledTimes(1);
    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe('I-minted-uuid');
    expect(ctx.getItemReference.get).not.toHaveBeenCalled();

    const loggedMint = infoSpy.mock.calls.some(([message]) =>
      typeof message === 'string' && message.includes('Generated new ItemUUID for item import')
    );
    expect(loggedMint).toBe(true);
  });

  test('mints a new ItemUUID when creating from an existing reference', async () => {
    const randomSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('reference-uuid' as any);
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const referenceRow = {
      Artikel_Nummer: 'REF-1001',
      Artikelbeschreibung: 'Referenzierter Artikel',
      Kurzbeschreibung: 'Kurztext',
      Langtext: 'Langtext',
      Hersteller: 'Referenz GmbH',
      Verkaufspreis: 12.5,
      Einheit: ItemEinheit.Stk,
      Shopartikel: 1
    };

    const ctx = createContext({
      getItemReference: { get: jest.fn().mockReturnValue(referenceRow) }
    });

    const form = new URLSearchParams({
      actor: 'linker',
      Artikel_Nummer: referenceRow.Artikel_Nummer,
      Artikelbeschreibung: '',
      Kurzbeschreibung: '',
      Langtext: '',
      Hersteller: '',
      Location: 'A-01-01'
    });

    const req = createRequest(form.toString(), { url: '/api/import/item' });
    const res = createResponse();

    try {
      await importItemAction.handle(req as any, res as any, ctx as any);
    } finally {
      randomSpy.mockRestore();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload?.item?.ItemUUID).toBe('I-reference-uuid');

    expect(ctx.getItemReference.get).toHaveBeenCalledWith(referenceRow.Artikel_Nummer);
    expect(ctx.persistItemWithinTransaction).toHaveBeenCalledTimes(1);
    const persistedItem = ctx.persistItemWithinTransaction.mock.calls[0]?.[0];
    expect(persistedItem?.ItemUUID).toBe('I-reference-uuid');
    expect(persistedItem?.__skipReferencePersistence).toBe(true);
    expect(persistedItem?.__referenceRowOverride).toEqual(referenceRow);

    const loggedMint = infoSpy.mock.calls.some(([message]) =>
      typeof message === 'string' && message.includes('Creating new item instance from existing reference')
    );
    expect(loggedMint).toBe(true);
  });
});
