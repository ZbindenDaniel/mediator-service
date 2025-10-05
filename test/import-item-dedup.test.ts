import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const DB_FILE = path.join(__dirname, 'import-item-dedup.test.sqlite');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(DB_FILE + suffix, { force: true });
}
process.env.DB_PATH = DB_FILE;

const importItem = require('../backend/actions/import-item').default;
const {
  db,
  getItem,
  getBox,
  upsertBox,
  buildItemRefRecord,
  buildItemQuantRecord,
  upsertItemRef,
  upsertItemQuant,
  upsertAgenticRun,
  logEvent,
  getMaxBoxId,
  getMaxItemId,
  createItemRefKey,
  getItemRefIdByKey
} = require('../backend/db');

interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}

function createFormRequest(pathname: string, body: Record<string, string>): any {
  const payload = new URLSearchParams(body).toString();
  const req = new Readable({ read() {} });
  req.push(payload);
  req.push(null);
  (req as any).url = pathname;
  (req as any).method = 'POST';
  (req as any).headers = { 'content-type': 'application/x-www-form-urlencoded' };
  return req as any;
}

function runAction(action: any, req: any, ctx: any): Promise<MockResponse> {
  return new Promise((resolve) => {
    const res: MockResponse = {
      headers: {},
      writeHead(status: number, headers: Record<string, string>) {
        this.status = status;
        this.headers = headers;
      },
      end(chunk?: any) {
        this.body = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
        resolve(this);
      }
    } as MockResponse;
    Promise.resolve(action.handle(req, res as any, ctx)).catch((err: Error) => {
      console.error('Action execution failed', err);
      resolve(res);
    });
  });
}

const sharedContext = {
  db,
  getItem,
  getBox,
  upsertBox,
  buildItemRefRecord,
  buildItemQuantRecord,
  upsertItemRef,
  upsertItemQuant,
  upsertAgenticRun,
  logEvent,
  getMaxBoxId,
  getMaxItemId,
  createItemRefKey,
  getItemRefIdByKey
};

describe('import-item deduplication', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM agentic_runs;
      DELETE FROM events;
      DELETE FROM item_quants;
      DELETE FROM item_refs;
      DELETE FROM boxes;
    `);
  });

  afterAll(() => {
    db.close?.();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(DB_FILE + suffix, { force: true });
    }
  });

  test('reuses item_ref for duplicate Artikel_Nummer', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const actor = 'tester';

      const firstReq = createFormRequest('/api/import/item', {
        actor,
        BoxID: 'B-DUP-0001',
        ItemUUID: 'I-DUP-0001',
        Artikel_Nummer: '4711',
        Artikelbeschreibung: 'Duplicate candidate',
        Auf_Lager: '3',
        Location: 'A-01-01'
      });

      const firstRes = await runAction(importItem, firstReq, sharedContext);
      expect(firstRes.status).toBe(200);

      const firstRow = getItem.get('I-DUP-0001');
      expect(firstRow).toBeTruthy();
      const firstRefId = firstRow.ItemRefID;
      expect(typeof firstRefId).toBe('number');

      const secondReq = createFormRequest('/api/import/item', {
        actor,
        BoxID: 'B-DUP-0002',
        ItemUUID: 'I-DUP-0002',
        Artikel_Nummer: '4711',
        Artikelbeschreibung: 'Duplicate candidate copy',
        Auf_Lager: '1',
        Location: 'A-01-02'
      });

      const secondRes = await runAction(importItem, secondReq, sharedContext);
      expect(secondRes.status).toBe(200);

      const secondRow = getItem.get('I-DUP-0002');
      expect(secondRow).toBeTruthy();
      expect(secondRow.ItemRefID).toBe(firstRefId);

      const dedupLog = infoSpy.mock.calls.find((call) => call[0] === '[import-item] Reusing existing item_ref record');
      expect(dedupLog).toBeTruthy();
      expect(dedupLog?.[1]).toMatchObject({ artikelNummer: '4711' });

      const mismatchLog = warnSpy.mock.calls.find((call) => call[0] === '[import-item] Deduplication mismatch after upsert');
      expect(mismatchLog).toBeUndefined();
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
