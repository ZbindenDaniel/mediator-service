import type { ShopwareSyncQueueEntry } from './queueTypes';

export interface ShopwareQueueClientLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface ShopwareQueueClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  logger?: ShopwareQueueClientLogger;
}

export interface ShopwareSyncJobDescriptor {
  correlationId: string;
  jobType: string;
  payload: unknown;
  attempt: number;
  source?: ShopwareSyncQueueEntry;
}

export interface ShopwareQueueDispatchResult {
  ok: boolean;
  correlationId?: string;
  message?: string;
  retryable?: boolean;
  nextRetryDelayMs?: number;
}

export interface ShopwareQueueClient {
  dispatchJob(job: ShopwareSyncJobDescriptor): Promise<ShopwareQueueDispatchResult>;
}

export class ShopwareQueueClientError extends Error {
  public readonly retryable: boolean;
  public readonly correlationId?: string;
  public readonly nextRetryDelayMs?: number;

  constructor(
    message: string,
    options?: { retryable?: boolean; correlationId?: string; nextRetryDelayMs?: number; cause?: unknown }
  ) {
    super(message);
    this.name = 'ShopwareQueueClientError';
    this.retryable = options?.retryable ?? false;
    this.correlationId = options?.correlationId;
    if (options?.nextRetryDelayMs !== undefined && Number.isFinite(options.nextRetryDelayMs)) {
      this.nextRetryDelayMs = Math.max(0, Number(options.nextRetryDelayMs));
    }
    if (options?.cause !== undefined) {
      (this as unknown as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function normalizeShopwareQueueClientError(
  err: unknown,
  fallbackCorrelationId: string
): ShopwareQueueClientError {
  if (err instanceof ShopwareQueueClientError) {
    return err;
  }

  const retryableValue = (err as { retryable?: boolean } | undefined)?.retryable;
  const retryable = typeof retryableValue === 'boolean' ? retryableValue : true;
  const rawDelay = (err as { nextRetryDelayMs?: number } | undefined)?.nextRetryDelayMs;
  const delay = Number(rawDelay);
  const correlationCandidate = (err as { correlationId?: string } | undefined)?.correlationId;
  const correlationId = typeof correlationCandidate === 'string' && correlationCandidate.trim()
    ? correlationCandidate
    : fallbackCorrelationId;
  const message = err instanceof Error
    ? err.message
    : typeof err === 'string'
    ? err
    : 'Unknown Shopware client error';

  const normalized = new ShopwareQueueClientError(message, {
    retryable,
    correlationId,
    nextRetryDelayMs: Number.isFinite(delay) && delay > 0 ? delay : undefined,
    cause: err instanceof Error ? err : undefined
  });

  if (err instanceof Error && err.stack) {
    normalized.stack = err.stack;
  }

  return normalized;
}

// The real dispatch client now lives in ./syncClient.ts (createShopwareSyncClient), which composes
// the Admin-API write client with a DB snapshot loader. This module keeps the shared queue types and
// the error normalizer used by the worker.
