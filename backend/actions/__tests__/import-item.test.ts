import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { DEFAULT_ITEM_UNIT } from '../../../models';
import { prepareNewItemCreationBranch } from '../../ops/import-item/branching';
import { persistItemImages } from '../../ops/import-item/imagePersistence';
import { prepareAgenticTrigger } from '../../ops/import-item/agentic';

const mod = require('../import-item');
const action = mod.default || mod;

type LoggerStub = {
  info: (message: string, payload?: Record<string, unknown>) => void;
  warn: (message: string, payload?: Record<string, unknown>) => void;
  error: (message: string, payload?: Record<string, unknown>) => void;
  calls: {
    info: Array<{ message: string; payload?: Record<string, unknown> }>;
    warn: Array<{ message: string; payload?: Record<string, unknown> }>;
    error: Array<{ message: string; payload?: Record<string, unknown> }>;
  };
};

function createLoggerStub(): LoggerStub {
  const calls = { info: [], warn: [], error: [] as any[] } as LoggerStub['calls'];
  return {
    calls,
    info(message, payload) {
      calls.info.push({ message, payload });
    },
    warn(message, payload) {
      calls.warn.push({ message, payload });
    },
    error(message, payload) {
      calls.error.push({ message, payload });
    }
  };
}

class MockResponse {
  statusCode = 0;
  headers: Record<string, unknown> = {};
  body = '';

  writeHead(status: number, headers: Record<string, unknown>): this {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }

  end(body?: unknown): void {
    this.body = typeof body === 'string' ? body : body ? body.toString() : '';
  }
}

function createRequest(body: string): IncomingMessage {
  const stream = new PassThrough();
  (stream as unknown as IncomingMessage).method = 'POST';
  process.nextTick(() => {
    stream.write(body);
    stream.end();
  });
  return stream as unknown as IncomingMessage;
}

describe('import-item helpers', () => {
  test('prepareNewItemCreationBranch increments sequences when lookups exist', () => {
    const logger = createLoggerStub();
    const now = new Date('2024-04-05T12:34:56Z');
    const branch = prepareNewItemCreationBranch(
      { now },
      {
        getMaxBoxId: { get: () => ({ BoxID: 'B-050424-0009' }) },
        getMaxItemId: { get: () => ({ ItemUUID: 'I-050424-0014' }) },
        logger
      }
    );
    expect(branch.reference.BoxID).toBe('B-050424-0010');
    expect(branch.reference.ItemUUID).toBe('I-050424-0015');
    expect(branch.isoNow).toBe(now.toISOString());
  });

  test('persistItemImages writes files and returns first image path', () => {
    const logger = createLoggerStub();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-item-test-'));
    const imageData = Buffer.from('image-bytes');
    const dataUrl = `data:image/png;base64,${imageData.toString('base64')}`;
    const itemUUID = 'I-010124-0001';

    const firstImage = persistItemImages({
      itemUUID,
      mediaDir: tmpDir,
      images: [dataUrl],
      artikelNummer: 'ART-001',
      logger
    });

    expect(firstImage).toBe('/media/I-010124-0001/ART-001-1.png');
    const saved = path.join(tmpDir, itemUUID, 'ART-001-1.png');
    expect(fs.existsSync(saved)).toBe(true);
  });

  test('prepareAgenticTrigger normalizes unsupported status and trims search query', () => {
    const logger = createLoggerStub();
    const result = prepareAgenticTrigger(
      {
        requestedStatus: 'Processing',
        agenticSearch: '  special widget  ',
        fallbackDescription: 'ignored'
      },
      logger
    );
    expect(result.status).toBe('queued');
    expect(result.searchQuery).toBe('special widget');
    expect(logger.calls.warn.length).toBe(1);
  });
});

describe('import-item action unit defaults', () => {
  test('applies default Einheit when none provided', async () => {
    const logger = createLoggerStub();
    const ctx = createCtx(logger);
    const req = createRequest('actor=tester&Artikelbeschreibung=UnitTest');
    const res = new MockResponse();

    await action.handle(req, res as unknown as ServerResponse, ctx);

    expect(res.statusCode).toBe(200);
    expect(ctx.upsertItem.calls.length).toBe(1);
    const saved = ctx.upsertItem.calls[0];
    expect(saved.Einheit).toBe(DEFAULT_ITEM_UNIT);
  });

  test('keeps provided Einheit untouched', async () => {
    const logger = createLoggerStub();
    const ctx = createCtx(logger);
    const req = createRequest('actor=tester&Artikelbeschreibung=Explicit&Einheit=Kartons');
    const res = new MockResponse();

    await action.handle(req, res as unknown as ServerResponse, ctx);

    expect(res.statusCode).toBe(200);
    expect(ctx.upsertItem.calls.length).toBe(1);
    const saved = ctx.upsertItem.calls[0];
    expect(saved.Einheit).toBe('Kartons');
  });
});

function createCtx(logger: LoggerStub) {
  const upsertItemCalls: any[] = [];
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-item-media-'));
  const ctx: any = {
    getMaxBoxId: { get: () => undefined },
    getMaxItemId: { get: () => undefined },
    upsertBox: { run: () => {} },
    upsertItem: {
      run: (item: any) => {
        upsertItemCalls.push(item);
      }
    },
    upsertAgenticRun: { run: () => {} },
    logEvent: { run: () => {} },
    db: {
      transaction: (fn: (...args: any[]) => void) => {
        return (...args: any[]) => fn(...args);
      }
    },
    MEDIA_DIR: mediaDir,
    logger
  };
  ctx.upsertItem.calls = upsertItemCalls;
  return ctx;
}
