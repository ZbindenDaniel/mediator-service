import fs from 'fs';
import os from 'os';
import path from 'path';

import printBoxAction from '../backend/actions/print-box';
import printItemAction from '../backend/actions/print-item';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

function createResponse(): MockResponse {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      if (!chunk) return;
      this.body += chunk.toString();
    }
  };
}

describe('print label actions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('print-box handler provides structured payload and dispatches PDF', async () => {
    const previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-box-'));
    const pdfCalls: { boxData: unknown; outPath: string }[] = [];
    const printCalls: { filePath: string; jobName?: string }[] = [];
    const originalNow = Date.now;
    Date.now = () => 1700000000000;

    try {
      const req = { url: '/api/print/box/BOX-1', method: 'POST' } as any;
      const res = createResponse();
      const ctx = {
        PREVIEW_DIR: previewDir,
        getBox: { get: () => ({ BoxID: 'BOX-1', Location: 'A-01', Notes: 'Spare parts' }) },
        itemsByBox: { all: () => [{ Auf_Lager: 2 }, { Auf_Lager: '3' }] },
        pdfForBox: async ({ boxData, outPath }: { boxData: unknown; outPath: string }) => {
          pdfCalls.push({ boxData, outPath });
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, 'pdf');
          return outPath;
        },
        printPdf: async ({ filePath, jobName }: { filePath: string; jobName?: string }) => {
          printCalls.push({ filePath, jobName });
          return { sent: true };
        },
        logEvent: jest.fn()
      };

      await printBoxAction.handle(req, res as any, ctx);

      expect(res.statusCode).toBe(200);
      const responseBody = JSON.parse(res.body);
      expect(responseBody.sent).toBe(true);
      expect(responseBody.qrPayload).toMatchObject({
        type: 'box',
        id: 'BOX-1',
        location: 'A-01',
        description: 'Spare parts',
        quantity: 5,
        itemCount: 2
      });
      expect(responseBody.previewUrl).toBe('/prints/box-BOX-1-1700000000000.pdf');
      expect(pdfCalls).toHaveLength(1);
      expect(pdfCalls[0].boxData).toEqual(responseBody.qrPayload);
      expect(printCalls).toEqual([
        {
          filePath: path.join(previewDir, 'box-BOX-1-1700000000000.pdf'),
          jobName: 'Box BOX-1'
        }
      ]);
      expect(fs.existsSync(path.join(previewDir, 'box-BOX-1-1700000000000.pdf'))).toBe(true);
    } finally {
      Date.now = originalNow;
      fs.rmSync(previewDir, { recursive: true, force: true });
    }
  });

  test('print-item handler keeps preview when printer fails', async () => {
    const previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-item-'));
    const pdfCalls: { itemData: unknown; outPath: string }[] = [];
    const printCalls: { filePath: string; jobName?: string }[] = [];
    const originalNow = Date.now;
    Date.now = () => 1700000001000;

    try {
      const req = { url: '/api/print/item/ITEM-1', method: 'POST' } as any;
      const res = createResponse();
      const ctx = {
        PREVIEW_DIR: previewDir,
        getItem: {
          get: () => ({
            ItemUUID: 'ITEM-1',
            Artikel_Nummer: 'M-100',
            BoxID: 'BOX-9',
            Location: 'B-02',
            Kurzbeschreibung: 'Widget',
            Auf_Lager: '7'
          })
        },
        pdfForItem: async ({ itemData, outPath }: { itemData: unknown; outPath: string }) => {
          pdfCalls.push({ itemData, outPath });
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, 'pdf');
          return outPath;
        },
        printPdf: async ({ filePath, jobName }: { filePath: string; jobName?: string }) => {
          printCalls.push({ filePath, jobName });
          return { sent: false, reason: 'printer_offline' };
        },
        logEvent: jest.fn()
      };

      await printItemAction.handle(req, res as any, ctx);

      expect(res.statusCode).toBe(200);
      const responseBody = JSON.parse(res.body);
      expect(responseBody.sent).toBe(false);
      expect(responseBody.reason).toBe('printer_offline');
      expect(responseBody.previewUrl).toBe('/prints/item-ITEM-1-1700000001000.pdf');
      expect(printCalls).toEqual([
        {
          filePath: path.join(previewDir, 'item-ITEM-1-1700000001000.pdf'),
          jobName: 'Item ITEM-1'
        }
      ]);
      expect(pdfCalls).toHaveLength(1);
      expect(fs.existsSync(path.join(previewDir, 'item-ITEM-1-1700000001000.pdf'))).toBe(true);
    } finally {
      Date.now = originalNow;
      fs.rmSync(previewDir, { recursive: true, force: true });
    }
  });
});
