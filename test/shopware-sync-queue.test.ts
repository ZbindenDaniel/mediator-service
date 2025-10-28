import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingMessage } from 'http';

const TEST_DB_FILE = path.join(__dirname, 'shopware-sync-queue.sqlite');
const ORIGINAL_DB_PATH = process.env.DB_PATH;

function removeDatabaseFiles(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${TEST_DB_FILE}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }
}

removeDatabaseFiles();
process.env.DB_PATH = TEST_DB_FILE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  db,
  persistItem,
  getItem,
  getBox,
  listEventsForItem,
  getAgenticRun,
  persistItemWithinTransaction,
  logEvent,
  incrementItemStock,
  decrementItemStock,
  enqueueShopwareSyncJob,
  listShopwareSyncJobs,
  clearShopwareSyncJobs
} = require('../backend/db');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const addItemAction = require('../backend/actions/add-item').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const removeItemAction = require('../backend/actions/remove-item').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const saveItemAction = require('../backend/actions/save-item').default;

const ITEM_ID = 'I-TEST-0001';
const BOX_ID = 'B-TEST-0001';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

type JsonRequestOptions = {
  method?: string;
};

function createJsonRequest(url: string, body: unknown, options: JsonRequestOptions = {}): IncomingMessage {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const stream = Readable.from([payload]) as Readable & { method: string; headers: Record<string, string>; url: string };
  stream.method = options.method ?? 'POST';
  stream.headers = { 'content-type': 'application/json' };
  stream.url = url;
  return stream as unknown as IncomingMessage;
}

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
      if (chunk) {
        this.body = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      }
    }
  };
}

function clearTables(): void {
  db.exec(
    'DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue; DELETE FROM shopware_sync_queue;'
  );
}

beforeEach(() => {
  clearTables();
  persistItem({
    ItemUUID: ITEM_ID,
    Artikel_Nummer: 'SKU-100',
    BoxID: BOX_ID,
    Location: 'A-01-01',
    UpdatedAt: new Date('2024-01-01T00:00:00Z'),
    Datum_erfasst: undefined,
    Auf_Lager: 1,
    Artikelbeschreibung: 'Initial item'
  });
  clearShopwareSyncJobs();
});

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[shopware-sync-queue.test] Failed to close database', error);
  }
  removeDatabaseFiles();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('Shopware sync queue triggers', () => {
  test('add-item enqueues stock increment job', async () => {
    const req = createJsonRequest(`/api/items/${ITEM_ID}/add`, { actor: 'tester' });
    const res = createResponse();

    await addItemAction.handle(req, res as unknown as any, {
      db,
      getItem,
      incrementItemStock,
      logEvent,
      enqueueShopwareSyncJob
    });

    expect(res.statusCode).toBe(200);
    const jobs = listShopwareSyncJobs();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.Operation).toBe('stock-increment');
    expect(job.TriggerSource).toBe('add-item');
    expect(job.ItemUUID).toBe(ITEM_ID);
    const payload = job.Payload as { quantityBefore?: number; quantityAfter?: number };
    expect(payload.quantityBefore).toBe(1);
    expect(payload.quantityAfter).toBe(2);
  });

  test('remove-item enqueues stock decrement job', async () => {
    const req = createJsonRequest(`/api/items/${ITEM_ID}/remove`, { actor: 'tester' });
    const res = createResponse();

    await removeItemAction.handle(req, res as unknown as any, {
      db,
      getItem,
      decrementItemStock,
      logEvent,
      enqueueShopwareSyncJob
    });

    expect(res.statusCode).toBe(200);
    const jobs = listShopwareSyncJobs();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.Operation).toBe('stock-decrement');
    expect(job.TriggerSource).toBe('remove-item');
    const payload = job.Payload as { quantityBefore?: number; quantityAfter?: number; clearedBox?: boolean };
    expect(payload.quantityBefore).toBe(1);
    expect(payload.quantityAfter).toBe(0);
    expect(payload.clearedBox).toBe(true);
  });

  test('save-item enqueues upsert job with updated metadata', async () => {
    const req = createJsonRequest(
      `/api/items/${ITEM_ID}`,
      {
        actor: 'editor',
        Artikelbeschreibung: 'Updated description',
        BoxID: BOX_ID,
        Einheit: 'Stk'
      },
      { method: 'PUT' }
    );
    const res = createResponse();

    await saveItemAction.handle(req, res as unknown as any, {
      db,
      persistItemWithinTransaction,
      logEvent,
      getItem,
      getBox,
      listEventsForItem,
      getAgenticRun,
      enqueueShopwareSyncJob
    });

    expect(res.statusCode).toBe(200);
    const jobs = listShopwareSyncJobs();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.Operation).toBe('item-upsert');
    expect(job.TriggerSource).toBe('save-item');
    const payload = job.Payload as { actor?: string; artikelNummer?: string | null };
    expect(payload.actor).toBe('editor');
    expect(payload.artikelNummer).toBe('SKU-100');
  });
});
