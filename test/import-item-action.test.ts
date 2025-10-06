import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { DEFAULT_ITEM_UNIT } from '../models';

const mod = require('../backend/actions/import-item');
const action = mod.default || mod;

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

describe('import-item action unit defaults', () => {
  test('applies default Einheit when none provided', async () => {
    const ctx = createCtx();
    const req = createRequest('actor=tester&Artikelbeschreibung=UnitTest');
    const res = new MockResponse();

    await action.handle(req, res as unknown as ServerResponse, ctx);

    expect(res.statusCode).toBe(200);
    expect(ctx.upsertItem.calls.length).toBe(1);
    const saved = ctx.upsertItem.calls[0];
    expect(saved.Einheit).toBe(DEFAULT_ITEM_UNIT);
  });

  test('keeps provided Einheit untouched', async () => {
    const ctx = createCtx();
    const req = createRequest('actor=tester&Artikelbeschreibung=Explicit&Einheit=Kartons');
    const res = new MockResponse();

    await action.handle(req, res as unknown as ServerResponse, ctx);

    expect(res.statusCode).toBe(200);
    expect(ctx.upsertItem.calls.length).toBe(1);
    const saved = ctx.upsertItem.calls[0];
    expect(saved.Einheit).toBe('Kartons');
  });
});

function createCtx() {
  const upsertItemCalls: any[] = [];
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
    }
  };
  ctx.upsertItem.calls = upsertItemCalls;
  return ctx;
}
