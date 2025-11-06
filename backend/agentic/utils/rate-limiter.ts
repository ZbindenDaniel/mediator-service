import { setTimeout as delay } from 'node:timers/promises';

export interface RateLimiterLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  debug?: Console['debug'];
  error?: Console['error'];
}

export interface RateLimiterMetadata {
  delayMs?: number;
  query?: string;
  maxResults?: number;
  [key: string]: unknown;
}

export const DEFAULT_DELAY_MS = 750;

function normalizeDelay(value: unknown, fallback = DEFAULT_DELAY_MS): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createRateLimiter({ delayMs, logger }: { delayMs?: number; logger?: RateLimiterLogger } = {}) {
  const baseDelay = normalizeDelay(delayMs, DEFAULT_DELAY_MS);
  const queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    metadata?: RateLimiterMetadata;
  }> = [];
  let processing = false;
  let lastStartTs = 0;

  async function processQueue(): Promise<void> {
    if (processing) {
      return;
    }
    processing = true;
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) {
        continue;
      }
      const { task, resolve, reject, metadata } = entry;
      const desiredGap = normalizeDelay(metadata?.delayMs, baseDelay);
      const now = Date.now();
      const waitMs = Math.max(0, lastStartTs + desiredGap - now);

      if (waitMs > 0) {
        logger?.info?.({
          msg: 'search limiter delaying task',
          delayMs: waitMs,
          pending: queue.length,
          query: metadata?.query,
          maxResults: metadata?.maxResults
        });
        try {
          await delay(waitMs);
        } catch (err) {
          logger?.warn?.({ msg: 'search limiter delay interrupted', err });
        }
      }

      try {
        logger?.debug?.({
          msg: 'search limiter executing task',
          query: metadata?.query,
          maxResults: metadata?.maxResults
        });
        lastStartTs = Date.now();
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }
    processing = false;
  }

  return function enqueue<T>(task: () => Promise<T>, metadata?: RateLimiterMetadata): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ task, resolve, reject, metadata });
      logger?.debug?.({
        msg: 'search limiter task enqueued',
        queueSize: queue.length,
        query: metadata?.query
      });
      processQueue().catch((err) => {
        logger?.error?.({ msg: 'search limiter processing failed', err });
      });
    });
  };
}
