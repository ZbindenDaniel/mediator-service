import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const DB_FILE = path.join(__dirname, 'item-relations.test.sqlite');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(DB_FILE + suffix, { force: true });
}
process.env.DB_PATH = DB_FILE;

const importItem = require('../backend/actions/import-item').default;
const listItemsAction = require('../backend/actions/list-items').default;
const searchAction = require('../backend/actions/search').default;
const saveItemAction = require('../backend/actions/save-item').default;

const {
  db,
  getItem,
  getBox,
  listItems,
  listEventsForItem,
  getAgenticRun,
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

function createGetRequest(pathname: string): any {
  const req = new Readable({ read() {} });
  req.push(null);
  (req as any).url = pathname;
  (req as any).method = 'GET';
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

const importContext = {
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

async function seedItem(): Promise<void> {
  const req = createFormRequest('/api/import/item', {
    actor: 'reader',
    BoxID: 'B-REL-0001',
    ItemUUID: 'I-REL-0001',
    Artikel_Nummer: '9900',
    Artikelbeschreibung: 'Joined item',
    Auf_Lager: '4',
    Location: 'R-01-01'
  });
  const res = await runAction(importItem, req, importContext);
  if (res.status !== 200) {
    throw new Error(`Failed to seed item: ${res.status}`);
  }
}

describe('item read endpoints join reference and quantity data', () => {
  beforeEach(async () => {
    db.exec(`
      DELETE FROM agentic_runs;
      DELETE FROM events;
      DELETE FROM item_quants;
      DELETE FROM item_refs;
      DELETE FROM boxes;
    `);
    await seedItem();
  });

  afterAll(() => {
    db.close?.();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(DB_FILE + suffix, { force: true });
    }
  });

  test('list-items returns combined reference and quantity data', async () => {
    const req = createGetRequest('/api/items');
    const ctx = { listItems };
    const res = await runAction(listItemsAction, req, ctx);
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body || '{}');
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBe(1);
    const [item] = payload.items;
    expect(item.reference.Artikel_Nummer).toBe('9900');
    expect(item.quantity.ItemUUID).toBe('I-REL-0001');
    expect(item.quantity.ItemRefID).toBe(item.reference.ItemRefID);
  });

  test('search returns combined reference and quantity data', async () => {
    const req = createGetRequest('/api/search?term=Joined');
    const ctx = { db };
    const res = await runAction(searchAction, req, ctx);
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body || '{}');
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThanOrEqual(1);
    const result = payload.items[0];
    expect(result.reference.Artikel_Nummer).toBe('9900');
    expect(result.quantity.ItemUUID).toBe('I-REL-0001');
    expect(result.quantity.ItemRefID).toBe(result.reference.ItemRefID);
  });

  test('item detail response includes reference and quantity', async () => {
    const req = createGetRequest('/api/items/I-REL-0001');
    const ctx = {
      getItem,
      getBox,
      listEventsForItem,
      getAgenticRun
    };
    const res = await runAction(saveItemAction, req, ctx);
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body || '{}');
    expect(payload.item.reference.Artikel_Nummer).toBe('9900');
    expect(payload.item.quantity.ItemUUID).toBe('I-REL-0001');
    expect(payload.item.quantity.ItemRefID).toBe(payload.item.reference.ItemRefID);
  });
});
