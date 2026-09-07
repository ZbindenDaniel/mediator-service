import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import adminContracts from '../admin-contracts';
import { getSpecContract, clearContractCaches, listContractSubcategories } from '../../contracts/registry';
import { resolveContractReadPath } from '../../contracts/paths';

function mockRes() {
  const res: any = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code: number, headers: Record<string, string>) => { res.statusCode = code; res.headers = headers; };
  res.end = (body: string) => { res.body = body; };
  return res;
}
function mockReq(method: string, url: string, body?: string): any {
  const req: any = body !== undefined ? Readable.from([Buffer.from(body)]) : new Readable({ read() { this.push(null); } });
  req.method = method;
  req.url = url;
  req.headers = {};
  return req;
}

const VALID_SPEC = { version: 1, subCategory: 9999, fields: [{ key: 'X', required: true, description: 'x' }] };

describe('admin-contracts overlay upload', () => {
  let overlay: string;
  beforeEach(() => {
    overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-overlay-'));
    process.env.CONTRACTS_OVERLAY_DIR = overlay;
    clearContractCaches();
  });
  afterEach(() => {
    delete process.env.CONTRACTS_OVERLAY_DIR;
    clearContractCaches();
    try { fs.rmSync(overlay, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('PUT validates + writes to the overlay, and the registry then reads the uploaded copy', async () => {
    const res = mockRes();
    await adminContracts.handle(mockReq('PUT', '/api/admin/contracts/specs/9999', JSON.stringify(VALID_SPEC)), res, {} as any);
    expect(res.statusCode).toBe(200);
    // File landed in the overlay, not the shipped dir.
    expect(fs.existsSync(path.join(overlay, 'specs', '9999.json'))).toBe(true);
    expect(resolveContractReadPath('specs/9999.json')).toBe(path.join(overlay, 'specs', '9999.json'));
    // Registry serves it (cache was cleared on write).
    expect(getSpecContract(9999)?.fields[0].key).toBe('X');
  });

  it('rejects an invalid contract with 400 (and writes nothing)', async () => {
    const res = mockRes();
    await adminContracts.handle(mockReq('PUT', '/api/admin/contracts/specs/9999', JSON.stringify({ version: 1, fields: 'nope' })), res, {} as any);
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(path.join(overlay, 'specs', '9999.json'))).toBe(false);
  });

  it('rejects non-JSON bodies with 400', async () => {
    const res = mockRes();
    await adminContracts.handle(mockReq('PUT', '/api/admin/contracts/quality/9999', 'not json'), res, {} as any);
    expect(res.statusCode).toBe(400);
  });

  it('DELETE reverts (removes the overlay copy)', async () => {
    // seed an overlay file
    fs.mkdirSync(path.join(overlay, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(overlay, 'specs', '9999.json'), JSON.stringify(VALID_SPEC));
    const res = mockRes();
    await adminContracts.handle(mockReq('DELETE', '/api/admin/contracts/specs/9999'), res, {} as any);
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(overlay, 'specs', '9999.json'))).toBe(false);
  });

  it('GET /api/admin/contracts reports coverage + overlayEnabled', async () => {
    const res = mockRes();
    await adminContracts.handle(mockReq('GET', '/api/admin/contracts'), res, {} as any);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.overlayEnabled).toBe(true);
    // Shipped spec contracts are present (e.g. 109 added earlier).
    expect(parsed.coverage.specs).toContain('109');
  });
});

describe('admin-contracts with overlay disabled', () => {
  beforeEach(() => { delete process.env.CONTRACTS_OVERLAY_DIR; clearContractCaches(); });

  it('refuses uploads with 503 when CONTRACTS_OVERLAY_DIR is unset', async () => {
    const res = mockRes();
    await adminContracts.handle(mockReq('PUT', '/api/admin/contracts/specs/9999', JSON.stringify(VALID_SPEC)), res, {} as any);
    expect(res.statusCode).toBe(503);
  });
});
