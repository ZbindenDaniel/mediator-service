import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_DELAY_MS = 750;

function normalizeDelay(value, fallback = DEFAULT_DELAY_MS) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createRateLimiter({ delayMs, logger } = {}) {
  const baseDelay = normalizeDelay(delayMs, DEFAULT_DELAY_MS);
  const queue = [];
  let processing = false;
  let lastStartTs = 0;

  async function processQueue() {
    if (processing) {
      return;
    }
    processing = true;
    while (queue.length) {
      const { task, resolve, reject, metadata } = queue.shift();
      const desiredGap = normalizeDelay(metadata?.delayMs, baseDelay);
      const now = Date.now();
      const waitMs = Math.max(0, lastStartTs + desiredGap - now);

      if (waitMs > 0) {
        logger?.info?.({
          msg: 'search limiter delaying task',
          delayMs: waitMs,
          pending: queue.length,
          query: metadata?.query,
          maxResults: metadata?.maxResults,
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
          maxResults: metadata?.maxResults,
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

  return function enqueue(task, metadata) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject, metadata });
      logger?.debug?.({
        msg: 'search limiter task enqueued',
        queueSize: queue.length,
        query: metadata?.query,
      });
      processQueue().catch((err) => {
        logger?.error?.({ msg: 'search limiter processing failed', err });
      });
    });
  };
}

export { DEFAULT_DELAY_MS };
