import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { sendAppShellFile } from '../app-shell';

function call(file: string, headers: Record<string, string> = {}) {
  const out = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    writeHead(status: number, h: Record<string, string>) { out.status = status; out.headers = h; },
    end(body?: Buffer) { out.body = body ? body.toString() : ''; }
  };
  sendAppShellFile({ headers } as unknown as IncomingMessage, res as unknown as ServerResponse, file, 'text/plain');
  return out;
}

describe('sendAppShellFile', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shell-')), 'bundle.js');
  beforeAll(() => fs.writeFileSync(file, 'v1'));

  it('serves the file with no-cache and an ETag, so browsers revalidate after deploys', () => {
    const r = call(file);
    expect(r.status).toBe(200);
    expect(r.body).toBe('v1');
    expect(r.headers['Cache-Control']).toBe('no-cache');
    expect(r.headers.ETag).toMatch(/^W\/".+"$/);
  });

  it('answers 304 without a body when the browser already has this version', () => {
    const { ETag } = call(file).headers;
    const r = call(file, { 'if-none-match': ETag });
    expect(r.status).toBe(304);
    expect(r.body).toBe('');
  });

  it('sends the new file once it changed', () => {
    const { ETag } = call(file).headers;
    fs.writeFileSync(file, 'version-2');
    const r = call(file, { 'if-none-match': ETag });
    expect(r.status).toBe(200);
    expect(r.body).toBe('version-2');
  });
});
