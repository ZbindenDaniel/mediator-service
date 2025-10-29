import {
  claimShopwareSyncJobs,
  markShopwareSyncJobFailed,
  markShopwareSyncJobSucceeded,
  rescheduleShopwareSyncJob,
  type ShopwareSyncQueueEntry
} from '../db';
import {
  normalizeShopwareQueueClientError,
  type ShopwareQueueClient,
  type ShopwareQueueDispatchResult,
  type ShopwareSyncJobDescriptor
} from '../shopware/queueClient';

export interface ShopwareQueueWorkerLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

// TODO: Wire these metric callbacks to the production telemetry stack.
export interface ShopwareQueueMetrics {
  recordDispatched?(jobType: string, correlationId: string): void;
  recordSucceeded?(jobType: string, correlationId: string): void;
  recordRetried?(jobType: string, correlationId: string): void;
  recordFailed?(jobType: string, correlationId: string): void;
  recordBatchDuration?(durationMs: number, metadata: { jobCount: number }): void;
}

export interface ProcessShopwareQueueOptions {
  client: ShopwareQueueClient;
  logger?: ShopwareQueueWorkerLogger;
  metrics?: ShopwareQueueMetrics;
  now?: () => Date;
  batchSize?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_RETRY_BASE_MS = 15_000;
const DEFAULT_RETRY_MAX_MS = 5 * 60 * 1000;

function serializeError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim()) {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch (jsonError) {
    return String(err ?? jsonError);
  }
}

function computeRetryDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  const delay = baseMs * Math.pow(2, exponent);
  return Math.min(delay, maxMs);
}

function parsePayload(rawPayload: string, job: ShopwareSyncQueueEntry, logger: ShopwareQueueWorkerLogger | undefined): unknown {
  if (!rawPayload) {
    return null;
  }

  try {
    return JSON.parse(rawPayload);
  } catch (err) {
    logger?.warn?.('[shopware-worker] Failed to parse Shopware job payload as JSON', {
      jobId: job.Id,
      correlationId: job.CorrelationId,
      jobType: job.JobType,
      error: serializeError(err)
    });
    return rawPayload;
  }
}

function resolveResultCorrelationId(
  job: ShopwareSyncQueueEntry,
  result: ShopwareQueueDispatchResult | undefined
): string {
  if (result?.correlationId && result.correlationId.trim()) {
    return result.correlationId;
  }
  return job.CorrelationId;
}

async function handleSuccess(
  job: ShopwareSyncQueueEntry,
  logger: ShopwareQueueWorkerLogger | undefined,
  metrics: ShopwareQueueMetrics | undefined,
  options: ProcessShopwareQueueOptions
): Promise<void> {
  const completionTime = options.now?.() ?? new Date();
  const completionIso = completionTime.toISOString();

  try {
    markShopwareSyncJobSucceeded(job.Id, completionIso);
    logger?.info?.('[shopware-worker] Shopware sync job succeeded', {
      jobId: job.Id,
      correlationId: job.CorrelationId,
      jobType: job.JobType
    });
    metrics?.recordSucceeded?.(job.JobType, job.CorrelationId);
  } catch (err) {
    logger?.error?.('[shopware-worker] Failed to record Shopware job success', {
      jobId: job.Id,
      correlationId: job.CorrelationId,
      jobType: job.JobType,
      error: err
    });
    throw err;
  }
}

async function handleRetry(
  job: ShopwareSyncQueueEntry,
  logger: ShopwareQueueWorkerLogger | undefined,
  metrics: ShopwareQueueMetrics | undefined,
  options: ProcessShopwareQueueOptions,
  message: string,
  correlationId: string,
  specifiedDelayMs: number | undefined
): Promise<void> {
  const now = options.now?.() ?? new Date();
  const updatedIso = now.toISOString();
  const nextAttemptBase = Math.max(0, Number(specifiedDelayMs));
  const newRetryCount = job.RetryCount + 1;
  const computedDelay = computeRetryDelayMs(
    newRetryCount,
    options.baseRetryDelayMs ?? DEFAULT_RETRY_BASE_MS,
    options.maxRetryDelayMs ?? DEFAULT_RETRY_MAX_MS
  );
  const delayMs = Number.isFinite(nextAttemptBase) && nextAttemptBase > 0 ? nextAttemptBase : computedDelay;
  const nextAttemptAt = new Date(now.getTime() + delayMs).toISOString();

  try {
    rescheduleShopwareSyncJob({
      id: job.Id,
      retryCount: newRetryCount,
      error: message,
      nextAttemptAt,
      updatedAt: updatedIso
    });
    logger?.warn?.('[shopware-worker] Shopware sync job scheduled for retry', {
      jobId: job.Id,
      correlationId,
      jobType: job.JobType,
      retryCount: newRetryCount,
      nextAttemptAt,
      delayMs
    });
    metrics?.recordRetried?.(job.JobType, correlationId);
  } catch (err) {
    logger?.error?.('[shopware-worker] Failed to reschedule Shopware job for retry', {
      jobId: job.Id,
      correlationId,
      jobType: job.JobType,
      error: err
    });
    throw err;
  }
}

async function handlePermanentFailure(
  job: ShopwareSyncQueueEntry,
  logger: ShopwareQueueWorkerLogger | undefined,
  metrics: ShopwareQueueMetrics | undefined,
  options: ProcessShopwareQueueOptions,
  message: string,
  correlationId: string
): Promise<void> {
  const now = options.now?.() ?? new Date();
  const updatedIso = now.toISOString();

  try {
    markShopwareSyncJobFailed({ id: job.Id, error: message, updatedAt: updatedIso });
    logger?.error?.('[shopware-worker] Shopware sync job failed permanently', {
      jobId: job.Id,
      correlationId,
      jobType: job.JobType,
      error: message
    });
    metrics?.recordFailed?.(job.JobType, correlationId);
  } catch (err) {
    logger?.error?.('[shopware-worker] Failed to persist Shopware job failure', {
      jobId: job.Id,
      correlationId,
      jobType: job.JobType,
      error: err
    });
    throw err;
  }
}

function buildDescriptor(
  job: ShopwareSyncQueueEntry,
  payload: unknown
): ShopwareSyncJobDescriptor {
  return {
    correlationId: job.CorrelationId,
    jobType: job.JobType,
    payload,
    attempt: job.RetryCount + 1,
    source: job
  };
}

export async function processShopwareQueue(options: ProcessShopwareQueueOptions): Promise<void> {
  const logger = options.logger ?? console;
  const metrics = options.metrics;
  const batchStart = options.now?.() ?? new Date();

  let jobs: ShopwareSyncQueueEntry[] = [];
  try {
    jobs = claimShopwareSyncJobs(options.batchSize ?? DEFAULT_BATCH_SIZE, batchStart.toISOString());
  } catch (err) {
    logger.error?.('[shopware-worker] Failed to claim Shopware sync jobs', err);
    return;
  }

  if (!jobs.length) {
    return;
  }

  for (const job of jobs) {
    metrics?.recordDispatched?.(job.JobType, job.CorrelationId);
    logger?.info?.('[shopware-worker] Processing Shopware sync job', {
      jobId: job.Id,
      correlationId: job.CorrelationId,
      jobType: job.JobType,
      retryCount: job.RetryCount
    });

    const payload = parsePayload(job.Payload, job, logger);
    const descriptor = buildDescriptor(job, payload);

    try {
      const result = await options.client.dispatchJob(descriptor);
      if (result.ok) {
        await handleSuccess(job, logger, metrics, options);
        continue;
      }

      const correlationId = resolveResultCorrelationId(job, result);
      const message = result.message ?? 'Shopware sync job failed';
      const retryable = result.retryable ?? false;
      if (retryable) {
        await handleRetry(job, logger, metrics, options, message, correlationId, result.nextRetryDelayMs);
      } else {
        await handlePermanentFailure(job, logger, metrics, options, message, correlationId);
      }
    } catch (err) {
      const normalized = normalizeShopwareQueueClientError(err, job.CorrelationId);
      const correlationId = normalized.correlationId ?? job.CorrelationId;
      const message = serializeError(normalized);
      if (normalized.retryable) {
        await handleRetry(job, logger, metrics, options, message, correlationId, normalized.nextRetryDelayMs);
      } else {
        await handlePermanentFailure(job, logger, metrics, options, message, correlationId);
      }
    }
  }

  const batchEnd = options.now?.() ?? new Date();
  const durationMs = Math.max(0, batchEnd.getTime() - batchStart.getTime());
  metrics?.recordBatchDuration?.(durationMs, { jobCount: jobs.length });
}
