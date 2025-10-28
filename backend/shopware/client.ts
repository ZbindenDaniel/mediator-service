import type { ShopwareSyncQueueEntry } from '../db';

export interface ShopwareClientLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface ShopwareClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  logger?: ShopwareClientLogger;
}

export interface ShopwareSyncJobDescriptor {
  correlationId: string;
  jobType: string;
  payload: unknown;
  attempt: number;
  source?: ShopwareSyncQueueEntry;
}

export interface ShopwareClientDispatchResult {
  ok: boolean;
  correlationId?: string;
  message?: string;
  retryable?: boolean;
  nextRetryDelayMs?: number;
}

export interface ShopwareClient {
  dispatchJob(job: ShopwareSyncJobDescriptor): Promise<ShopwareClientDispatchResult>;
}

export class ShopwareClientError extends Error {
  public readonly retryable: boolean;
  public readonly correlationId?: string;
  public readonly nextRetryDelayMs?: number;

  constructor(
    message: string,
    options?: { retryable?: boolean; correlationId?: string; nextRetryDelayMs?: number; cause?: unknown }
  ) {
    super(message);
    this.name = 'ShopwareClientError';
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

export function normalizeShopwareClientError(
  err: unknown,
  fallbackCorrelationId: string
): ShopwareClientError {
  if (err instanceof ShopwareClientError) {
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

  const normalized = new ShopwareClientError(message, {
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

// TODO: Replace placeholder implementation with HTTP client once Shopware API credentials are wired up.
export function createShopwareClient(options: ShopwareClientOptions): ShopwareClient {
  const logger = options.logger ?? console;
  if (!options.baseUrl) {
    logger.warn?.('[shopware-client] Base URL not provided; dispatch calls will fail immediately.');
  }

  return {
    async dispatchJob() {
      throw new ShopwareClientError('Shopware client dispatchJob not implemented', { retryable: false });
    }
  };
}
