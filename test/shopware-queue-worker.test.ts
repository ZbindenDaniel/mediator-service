import { beforeEach, describe, expect, jest, test } from './harness';
import {
  clearShopwareSyncQueue,
  enqueueShopwareSyncJob,
  getShopwareSyncJobById,
  type ShopwareSyncQueueEntry
} from '../backend/db';
import { processShopwareQueue, type ShopwareQueueMetrics } from '../backend/workers/processShopwareQueue';
import { ShopwareClientError, type ShopwareClient } from '../backend/shopware/client';

function getMockCalls(fn: unknown): any[][] {
  const mock = (fn as { mock?: { calls?: any[][] } })?.mock;
  if (!mock || !Array.isArray(mock.calls)) {
    return [];
  }
  return mock.calls;
}

describe('processShopwareQueue', () => {
  const baseDate = new Date('2024-01-01T00:00:00.000Z');
  const fixedNow = () => new Date(baseDate.getTime());

  const createLogger = () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  });

  const createMetrics = (): ShopwareQueueMetrics => ({
    recordDispatched: jest.fn(),
    recordSucceeded: jest.fn(),
    recordRetried: jest.fn(),
    recordFailed: jest.fn(),
    recordBatchDuration: jest.fn()
  });

  beforeEach(() => {
    clearShopwareSyncQueue();
  });

  function expectJobById(id: number): ShopwareSyncQueueEntry {
    const entry = getShopwareSyncJobById(id);
    if (!entry) {
      throw new Error(`Expected Shopware job ${id} to exist`);
    }
    return entry;
  }

  test('marks jobs as succeeded when the client resolves', async () => {
    const job = enqueueShopwareSyncJob({
      CorrelationId: 'corr-success',
      JobType: 'stock-update',
      Payload: JSON.stringify({ itemId: 'I-1', quantity: 3 })
    });

    const dispatchMockImpl = jest.fn().mockResolvedValue({ ok: true, correlationId: 'corr-success' });
    const client: ShopwareClient = {
      dispatchJob: dispatchMockImpl as unknown as ShopwareClient['dispatchJob']
    };
    const logger = createLogger();
    const metrics = createMetrics();

    await processShopwareQueue({ client, logger, metrics, now: fixedNow });

    expect(dispatchMockImpl).toHaveBeenCalled();
    const dispatchCalls = getMockCalls(dispatchMockImpl);
    expect(dispatchCalls.length).toBe(1);
    const descriptor = dispatchCalls[0][0];
    expect(descriptor.correlationId).toBe('corr-success');
    expect(descriptor.jobType).toBe('stock-update');
    expect(descriptor.payload).toEqual({ itemId: 'I-1', quantity: 3 });

    const updated = expectJobById(job.Id);
    expect(updated.Status).toBe('succeeded');
    expect(updated.RetryCount).toBe(0);
    expect(updated.LastError).toBeNull();
    expect(updated.NextAttemptAt).toBeNull();

    const dispatchedCalls = getMockCalls(metrics.recordDispatched);
    expect(dispatchedCalls.length).toBe(1);
    expect(dispatchedCalls[0]).toEqual(['stock-update', 'corr-success']);
    const succeededCalls = getMockCalls(metrics.recordSucceeded);
    expect(succeededCalls.length).toBe(1);
    expect(succeededCalls[0]).toEqual(['stock-update', 'corr-success']);
    const batchCalls = getMockCalls(metrics.recordBatchDuration);
    expect(batchCalls.length).toBe(1);
    expect(typeof batchCalls[0][0]).toBe('number');
    expect(batchCalls[0][1]).toEqual({ jobCount: 1 });
    expect(getMockCalls(logger.info).length).toBeGreaterThan(0);
  });

  test('requeues jobs on retryable client failures', async () => {
    const job = enqueueShopwareSyncJob({
      CorrelationId: 'corr-retry',
      JobType: 'product-sync',
      Payload: JSON.stringify({ itemId: 'I-2' })
    });

    const error = new ShopwareClientError('temporary outage', {
      retryable: true,
      nextRetryDelayMs: 60_000
    });
    const dispatchMockImpl = jest.fn().mockRejectedValue(error);
    const client: ShopwareClient = {
      dispatchJob: dispatchMockImpl as unknown as ShopwareClient['dispatchJob']
    };
    const logger = createLogger();
    const metrics = createMetrics();

    await processShopwareQueue({ client, logger, metrics, now: fixedNow, baseRetryDelayMs: 5_000, maxRetryDelayMs: 60_000 });

    const updated = expectJobById(job.Id);
    expect(updated.Status).toBe('queued');
    expect(updated.RetryCount).toBe(1);
    expect(updated.LastError).toMatch(/temporary outage/i);
    expect(updated.NextAttemptAt).toBe('2024-01-01T00:01:00.000Z');

    const retriedCalls = getMockCalls(metrics.recordRetried);
    expect(retriedCalls.length).toBe(1);
    expect(retriedCalls[0]).toEqual(['product-sync', 'corr-retry']);
    expect(getMockCalls(metrics.recordFailed).length).toBe(0);
    expect(getMockCalls(logger.warn).length).toBeGreaterThan(0);
  });

  test('marks jobs as failed when the client signals a permanent error', async () => {
    const job = enqueueShopwareSyncJob({
      CorrelationId: 'corr-fail',
      JobType: 'product-create',
      Payload: JSON.stringify({ sku: 'SKU-1' })
    });

    const dispatchMockImpl = jest.fn().mockResolvedValue({
      ok: false,
      retryable: false,
      message: 'Validation rejected',
      correlationId: 'corr-fail'
    });
    const client: ShopwareClient = {
      dispatchJob: dispatchMockImpl as unknown as ShopwareClient['dispatchJob']
    };
    const logger = createLogger();
    const metrics = createMetrics();

    await processShopwareQueue({ client, logger, metrics, now: fixedNow });

    const updated = expectJobById(job.Id);
    expect(updated.Status).toBe('failed');
    expect(updated.RetryCount).toBe(0);
    expect(updated.LastError).toBe('Validation rejected');
    expect(updated.NextAttemptAt).toBeNull();

    const failedCalls = getMockCalls(metrics.recordFailed);
    expect(failedCalls.length).toBe(1);
    expect(failedCalls[0]).toEqual(['product-create', 'corr-fail']);
    expect(getMockCalls(metrics.recordRetried).length).toBe(0);
    expect(getMockCalls(logger.error).length).toBeGreaterThan(0);
  });

  test('passes raw payload through when JSON parsing fails', async () => {
    const job = enqueueShopwareSyncJob({
      CorrelationId: 'corr-raw',
      JobType: 'debug',
      Payload: 'plain-text-payload'
    });

    const dispatchMockImpl = jest.fn().mockResolvedValue({ ok: true });
    const client: ShopwareClient = {
      dispatchJob: dispatchMockImpl as unknown as ShopwareClient['dispatchJob']
    };
    const logger = createLogger();
    const metrics = createMetrics();

    await processShopwareQueue({ client, logger, metrics, now: fixedNow });

    expect(dispatchMockImpl).toHaveBeenCalled();
    const calls = getMockCalls(dispatchMockImpl);
    expect(calls.length).toBe(1);
    const descriptor = calls[0][0];
    expect(descriptor.payload).toBe('plain-text-payload');
    const warnCalls = getMockCalls(logger.warn);
    expect(warnCalls.length).toBeGreaterThan(0);
    const [warnMessage, warnMeta] = warnCalls[0];
    expect(warnMessage).toBe('[shopware-worker] Failed to parse Shopware job payload as JSON');
    expect(warnMeta.correlationId).toBe('corr-raw');
  });
});
