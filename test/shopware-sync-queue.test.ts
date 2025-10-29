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
  listShopwareSyncQueue,
  clearShopwareSyncQueue,
  claimShopwareSyncJobs,
  markShopwareSyncJobSucceeded,
  rescheduleShopwareSyncJob,
  markShopwareSyncJobFailed,
  getShopwareSyncJobById
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
  clearShopwareSyncQueue();
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

function parsePayload(entry: { Payload: string }): any {
  try {
    return JSON.parse(entry.Payload);
  } catch (error) {
    throw new Error(`Failed to parse Shopware queue payload: ${(error as Error).message}`);
  }
}

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
    const jobs = listShopwareSyncQueue();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.JobType).toBe('stock-increment');
    expect(job.Status).toBe('queued');
    const payload = parsePayload(job) as { quantityBefore?: number; quantityAfter?: number; trigger?: string };
    expect(payload.trigger).toBe('add-item');
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
    const jobs = listShopwareSyncQueue();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.JobType).toBe('stock-decrement');
    const payload = parsePayload(job) as { quantityBefore?: number; quantityAfter?: number; clearedBox?: boolean; trigger?: string };
    expect(payload.trigger).toBe('remove-item');
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
    const jobs = listShopwareSyncQueue();
    expect(jobs.length).toBe(1);
    const job = jobs[0];
    expect(job.JobType).toBe('item-upsert');
    const payload = parsePayload(job) as { actor?: string; artikelNummer?: string | null; trigger?: string };
    expect(payload.trigger).toBe('save-item');
    expect(payload.actor).toBe('editor');
    expect(payload.artikelNummer).toBe('SKU-100');
  });
});

describe('shopware sync queue helpers', () => {
  beforeEach(() => {
    clearShopwareSyncQueue();
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

  function enqueueTestJob(correlationId: string, jobType: string, payload: unknown): number {
    const entry = enqueueShopwareSyncJob({
      CorrelationId: correlationId,
      JobType: jobType,
      Payload: JSON.stringify(payload)
    });
    return entry.Id;
  }

  test('claimShopwareSyncJobs marks entries as processing', () => {
    const jobId = enqueueTestJob('corr-claim', 'sync-stock', { attempt: 0 });
    const claimed = claimShopwareSyncJobs(1, '2024-04-05T12:00:00.000Z');
    expect(claimed.length).toBe(1);
    expect(claimed[0].Id).toBe(jobId);
    expect(claimed[0].Status).toBe('processing');
    expect(claimed[0].LastAttemptAt).toBe('2024-04-05T12:00:00.000Z');
  });

  test('rescheduleShopwareSyncJob updates retry metadata', () => {
    const jobId = enqueueTestJob('corr-retry', 'sync-stock', { attempt: 0 });
    const [job] = claimShopwareSyncJobs(1, '2024-04-05T12:00:00.000Z');
    expect(job?.Id).toBe(jobId);

    rescheduleShopwareSyncJob({
      id: jobId,
      retryCount: 1,
      error: 'temporary failure',
      nextAttemptAt: '2024-04-05T12:05:00.000Z',
      updatedAt: '2024-04-05T12:00:10.000Z'
    });

    const updated = getShopwareSyncJobById(jobId);
    expect(updated).toBeDefined();
    expect(updated?.Status).toBe('queued');
    expect(updated?.RetryCount).toBe(1);
    expect(updated?.LastError).toBe('temporary failure');
    expect(updated?.NextAttemptAt).toBe('2024-04-05T12:05:00.000Z');
  });

  test('markShopwareSyncJobSucceeded clears retry fields', () => {
    const jobId = enqueueTestJob('corr-success', 'sync-stock', {});
    claimShopwareSyncJobs(1, '2024-04-05T12:00:00.000Z');

    markShopwareSyncJobSucceeded(jobId, '2024-04-05T12:01:00.000Z');

    const updated = getShopwareSyncJobById(jobId);
    expect(updated).toBeDefined();
    expect(updated?.Status).toBe('succeeded');
    expect(updated?.RetryCount).toBe(0);
    expect(updated?.NextAttemptAt).toBeNull();
    expect(updated?.LastError).toBeNull();
  });

  test('markShopwareSyncJobFailed records permanent errors', () => {
    const jobId = enqueueTestJob('corr-fail', 'sync-stock', {});
    claimShopwareSyncJobs(1, '2024-04-05T12:00:00.000Z');

    markShopwareSyncJobFailed({ id: jobId, error: 'permanent failure', updatedAt: '2024-04-05T12:02:00.000Z' });

    const updated = getShopwareSyncJobById(jobId);
    expect(updated).toBeDefined();
    expect(updated?.Status).toBe('failed');
    expect(updated?.LastError).toBe('permanent failure');
    expect(updated?.NextAttemptAt).toBeNull();
  });
});
