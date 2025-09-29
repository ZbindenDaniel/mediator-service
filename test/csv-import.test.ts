import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import action from '../backend/actions/csv-import';

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

function createRequest(
  chunks: Array<Buffer | string>,
  headers: Record<string, string> = {}
): IncomingMessage {
  const stream = new PassThrough();
  (stream as unknown as IncomingMessage).headers = headers;
  (stream as unknown as IncomingMessage).method = 'POST';
  process.nextTick(() => {
    for (const chunk of chunks) {
      stream.write(chunk);
    }
    stream.end();
  });
  return stream as unknown as IncomingMessage;
}

function responseJson(res: MockResponse): any {
  return res.body ? JSON.parse(res.body) : {};
}

describe('csv-import action', () => {
  let inboxDir: string;

  beforeEach(() => {
    inboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-test-'));
  });

  afterEach(() => {
    fs.rmSync(inboxDir, { recursive: true, force: true });
  });

  test('streams a valid CSV upload to disk', async () => {
    const req = createRequest([Buffer.from('ItemUUID,BoxID\n1,2\n')], { 'x-filename': 'items.csv' });
    const res = new MockResponse();

    if (action.handle === undefined) {
      throw new Error('action.handle is undefined');
    }
    await action.handle(
      req,
      res as unknown as ServerResponse,
      { INBOX_DIR: inboxDir, CSV_MAX_UPLOAD_BYTES: 1024 }
    );

    expect(res.statusCode).toBe(200);
    const payload = responseJson(res);
    expect(payload.ok).toBe(true);
    const files = fs.readdirSync(inboxDir);
    expect(files.length).toBe(1);
    const saved = fs.readFileSync(path.join(inboxDir, files[0]), 'utf8');
    expect(saved.trim()).toBe('ItemUUID,BoxID\n1,2');
  });

  test('rejects oversize uploads and removes partial files', async () => {
    const req = createRequest(
      [Buffer.from('ItemUUID,BoxID\n'), Buffer.from('1,2\n' + 'a'.repeat(128))],
      { 'x-filename': 'large.csv' }
    );
    const res = new MockResponse();

    if (action.handle === undefined) {
      throw new Error('action.handle is undefined');
    }
    await action.handle(
      req,
      res as unknown as ServerResponse,
      { INBOX_DIR: inboxDir, CSV_MAX_UPLOAD_BYTES: 32 }
    );

    expect(res.statusCode).toBe(413);
    const payload = responseJson(res);
    expect(payload.error).toMatch(/byte limit/);
    expect(fs.readdirSync(inboxDir).length).toBe(0);
  });

  test('rejects non-CSV uploads based on first chunk signature', async () => {
    const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const req = createRequest([zipSignature], { 'x-filename': 'not-csv.csv' });
    const res = new MockResponse();

    if (action.handle === undefined) {
      throw new Error('action.handle is undefined');
    }
    await action.handle(
      req,
      res as unknown as ServerResponse,
      { INBOX_DIR: inboxDir, CSV_MAX_UPLOAD_BYTES: 1024 }
    );

    expect(res.statusCode).toBe(400);
    const payload = responseJson(res);
    expect(payload.error).toMatch(/supported/);
    expect(fs.readdirSync(inboxDir).length).toBe(0);
  });
});
