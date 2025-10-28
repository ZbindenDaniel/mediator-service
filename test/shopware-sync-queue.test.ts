import fs from 'fs';
import path from 'path';

const TEST_DB_FILE = path.join(__dirname, 'shopware-sync-queue.sqlite');
const ORIGINAL_DB_PATH = process.env.DB_PATH;

function removeTestDatabase(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${TEST_DB_FILE}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }
}

removeTestDatabase();
process.env.DB_PATH = TEST_DB_FILE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  db,
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
