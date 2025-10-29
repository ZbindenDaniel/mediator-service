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
  persistItemWithinTransaction,
  enqueueShopwareSyncJob,
  dequeueShopwareSyncJob,
  recordShopwareSyncJobFailure,
  markShopwareSyncJobCompleted
} = require('../backend/db');

const selectQueueMetadata = db.prepare(
  `SELECT Status, AttemptCount, LastError, AvailableAt, ShopwareProductId, ShopwareVariantId
     FROM shopware_sync_queue
    WHERE Id = ?`
);

function clearDatabase(): void {
  db.exec(
    [
      'DELETE FROM shopware_sync_queue;',
      'DELETE FROM events;',
      'DELETE FROM item_refs;',
      'DELETE FROM items;',
      'DELETE FROM boxes;',
      'DELETE FROM label_queue;'
    ].join('\n')
  );
}

describe('shopware sync queue helpers', () => {
  beforeEach(() => {
    clearDatabase();
    persistItemWithinTransaction({
      ItemUUID: 'I-SHOP-0001',
      Artikel_Nummer: null,
      BoxID: null,
      Location: null,
      UpdatedAt: new Date('2024-04-05T12:00:00Z'),
      Datum_erfasst: new Date('2024-04-05T12:00:00Z'),
      Auf_Lager: 1
    });
  });

  afterAll(() => {
    try {
      db.close();
    } catch (error) {
      console.warn('[shopware-sync-queue.test] Failed to close database', error);
    }
    removeTestDatabase();
    if (ORIGINAL_DB_PATH === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = ORIGINAL_DB_PATH;
    }
  });

  test('enqueue and dequeue updates attempt count atomically', () => {
    const enqueued = enqueueShopwareSyncJob({
      itemUUID: 'I-SHOP-0001',
      operation: 'sync-stock',
      payload: { delta: 3 },
      shopwareProductId: 'prod-123'
    });

    expect(enqueued.Status).toBe('pending');
    expect(enqueued.AttemptCount).toBe(0);
    expect(enqueued.ShopwareProductId).toBe('prod-123');

    const dequeued = dequeueShopwareSyncJob();
    expect(dequeued).toBeDefined();
    expect(dequeued?.Status).toBe('processing');
    expect(dequeued?.AttemptCount).toBe(1);
    expect(dequeued?.Payload).toEqual({ delta: 3 });

    const secondAttempt = dequeueShopwareSyncJob();
    expect(secondAttempt).toBeNull();
  });

  test('failed jobs record errors and schedule retries', () => {
    enqueueShopwareSyncJob({
      itemUUID: 'I-SHOP-0001',
      operation: 'sync-stock',
      payload: { quantity: 2 }
    });

    const dequeued = dequeueShopwareSyncJob();
    expect(dequeued).toBeDefined();
    expect(dequeued?.AttemptCount).toBe(1);

    const failureTime = Date.now();
    const retryJob = recordShopwareSyncJobFailure({
      id: dequeued!.Id,
      error: new Error('rate limit exceeded'),
      delayMs: 60_000
    });

    expect(retryJob).toBeDefined();
    expect(retryJob?.Status).toBe('pending');
    expect(retryJob?.LastError).toContain('rate limit exceeded');

    const nextAttemptTime = new Date(retryJob!.AvailableAt).getTime();
    expect(nextAttemptTime).toBeGreaterThanOrEqual(failureTime + 55_000);

    db.prepare(`UPDATE shopware_sync_queue SET AvailableAt = datetime('now', '-1 second') WHERE Id = ?`).run(dequeued!.Id);

    const retryDequeued = dequeueShopwareSyncJob();
    expect(retryDequeued).toBeDefined();
    expect(retryDequeued?.AttemptCount).toBe(2);
  });

  test('completion clears errors and persists identifiers', () => {
    enqueueShopwareSyncJob({
      itemUUID: 'I-SHOP-0001',
      operation: 'sync-product',
      payload: { sku: 'SKU-1' },
      shopwareVariantId: 'variant-initial'
    });

    const dequeued = dequeueShopwareSyncJob();
    expect(dequeued).toBeDefined();

    const completed = markShopwareSyncJobCompleted({
      id: dequeued!.Id,
      status: 'completed',
      shopwareProductId: 'prod-final',
      shopwareVariantId: 'variant-final'
    });

    expect(completed).toBeDefined();
    expect(completed?.Status).toBe('completed');
    expect(completed?.LastError).toBeNull();
    expect(completed?.ShopwareProductId).toBe('prod-final');
    expect(completed?.ShopwareVariantId).toBe('variant-final');

    const stored = selectQueueMetadata.get(dequeued!.Id) as
      | {
          Status: string;
          AttemptCount: number;
          LastError: string | null;
          AvailableAt: string;
          ShopwareProductId: string | null;
          ShopwareVariantId: string | null;
        }
      | undefined;

    expect(stored).toBeDefined();
    expect(stored?.Status).toBe('completed');
    expect(stored?.LastError).toBeNull();
    expect(stored?.ShopwareProductId).toBe('prod-final');
    expect(stored?.ShopwareVariantId).toBe('variant-final');
  });
});
