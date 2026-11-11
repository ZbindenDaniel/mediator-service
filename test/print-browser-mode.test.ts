import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

const settings: Record<string, string> = {};

jest.mock('../backend/utils/app-settings', () => ({
  getSetting: jest.fn(async (key: string, fallback = '') => settings[key] ?? fallback),
  getAllSettings: jest.fn(async (keys: Record<string, string>) =>
    Object.fromEntries(Object.entries(keys).map(([k, fallback]) => [k, settings[k] ?? fallback]))
  ),
  setSetting: jest.fn(),
  clearSetting: jest.fn(),
  hasOverride: jest.fn(async () => false)
}));

jest.mock('../backend/labelpdf', () => ({
  renderHtmlToPdf: jest.fn(async ({ htmlPath }: { htmlPath: string }) => {
    const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
    fs.writeFileSync(pdfPath, '%PDF');
    return pdfPath;
  })
}));

import { handleUnifiedPrintRequest } from '../backend/actions/print-unified';
import { validateSettingsBody } from '../backend/actions/admin-printer-settings';

function makeReq(url: string, body: unknown): any {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as any;
  req.url = url;
  req.method = 'POST';
  return req;
}

function makeRes() {
  const res: any = { status: 0, body: '' };
  res.writeHead = (status: number) => { res.status = status; };
  res.end = (body: string) => { res.body = body; };
  return res;
}

function makeCtx(previewDir: string) {
  return {
    PREVIEW_DIR: previewDir,
    getBox: jest.fn(async (id: string) => ({ BoxID: id, LocationId: null, Label: null, Notes: null })),
    itemsByBox: jest.fn(async () => []),
    htmlForBox: jest.fn(async ({ outPath }: { outPath: string }) => fs.writeFileSync(outPath, '<html></html>')),
    printFile: jest.fn(async () => ({ sent: true })),
    logEvent: jest.fn(async () => undefined)
  };
}

describe('print-unified in browser mode', () => {
  let previewDir: string;

  beforeEach(() => {
    previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-browser-'));
    for (const key of Object.keys(settings)) delete settings[key];
  });

  afterEach(() => {
    fs.rmSync(previewDir, { recursive: true, force: true });
  });

  it('renders the PDF and hands the IPP target to the browser instead of running lp', async () => {
    Object.assign(settings, {
      'printer.mode': 'browser',
      'printer.browser_url': 'http://192.168.1.20:8631/',
      'printer.queue.box': 'QL800_box'
    });
    const ctx = makeCtx(previewDir);
    const res = makeRes();

    await handleUnifiedPrintRequest(makeReq('/api/print/box/B-1', { actor: 'tester' }), res, ctx);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      sent: false,
      dispatch: 'browser',
      jobName: 'Box B-1',
      printer: { url: 'http://192.168.1.20:8631', queue: 'QL800_box' }
    });
    expect(body.pdfUrl).toMatch(/^\/prints\/box-B-1-\d+\.pdf$/);
    expect(fs.existsSync(path.join(previewDir, path.basename(body.pdfUrl)))).toBe(true);
    expect(ctx.printFile).not.toHaveBeenCalled();
  });

  it('fails with a clear reason when the proxy URL is missing', async () => {
    Object.assign(settings, { 'printer.mode': 'browser', 'printer.queue.box': 'QL800_box' });
    const ctx = makeCtx(previewDir);
    const res = makeRes();

    await handleUnifiedPrintRequest(makeReq('/api/print/box/B-2', { actor: 'tester' }), res, ctx);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ sent: false, reason: 'printer_browser_url_not_configured' });
    expect(body.dispatch).toBeUndefined();
    expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({ Event: 'PrintFailed' }));
  });

  it('keeps the server path (lp) when the mode is server', async () => {
    Object.assign(settings, { 'printer.queue.box': 'QL800_box' });
    const ctx = makeCtx(previewDir);
    const res = makeRes();

    await handleUnifiedPrintRequest(makeReq('/api/print/box/B-3', { actor: 'tester' }), res, ctx);

    expect(ctx.printFile).toHaveBeenCalledWith(expect.objectContaining({ printerQueue: 'QL800_box' }));
    expect(JSON.parse(res.body)).toMatchObject({ sent: true });
  });
});

describe('validateSettingsBody', () => {
  it('accepts valid mode and proxy URL values', () => {
    expect(validateSettingsBody({ mode: 'browser', browserUrl: 'http://192.168.1.20:8631' })).toBeNull();
    expect(validateSettingsBody({ mode: '', browserUrl: '' })).toBeNull();
  });

  it('rejects unknown modes and non-http URLs', () => {
    expect(validateSettingsBody({ mode: 'magic' })).toMatch(/mode/);
    expect(validateSettingsBody({ browserUrl: 'ftp://x' })).toMatch(/browserUrl/);
    expect(validateSettingsBody({ browserUrl: 'not a url' })).toMatch(/browserUrl/);
  });
});

describe('browser proxy URL normalization', () => {
  it('assumes http:// for a bare host:port and strips trailing slashes', async () => {
    const { normalizeBrowserUrl } = await import('../backend/print');
    expect(normalizeBrowserUrl('192.168.10.183:8765')).toBe('http://192.168.10.183:8765');
    expect(normalizeBrowserUrl('https://print.lan/')).toBe('https://print.lan');
    expect(normalizeBrowserUrl('  ')).toBe('');
    expect(validateSettingsBody({ browserUrl: '192.168.10.183:8765' })).toBeNull();
  });
});
