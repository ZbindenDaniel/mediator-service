import { sendToExternal } from './utils/externalApi.js';
import {
  getPendingNotifications,
  markNotificationFailure,
  markNotificationSuccess,
} from './utils/db.js';
import { logger } from './utils/logger.js';

const DEFAULT_INTERVAL_MS = 30000;
let workerHandle = null;

async function processPendingNotifications() {
  let pending = [];
  try {
    pending = await getPendingNotifications(20);
  } catch (err) {
    logger.error({ err }, 'failed to load pending notifications');
    return;
  }

  for (const entry of pending) {
    const { uuid, payload } = entry;
    if (!payload) {
      logger.warn({ uuid }, 'skipping pending notification with missing payload');
      continue;
    }

    const payloadItemId = payload?.itemId ?? payload?.item?.itemUUid ?? payload?.id ?? null;

    try {
      await sendToExternal(payload);
      await markNotificationSuccess(uuid);
      logger.info({ uuid, itemId: payloadItemId }, 'notification replay succeeded');
    } catch (err) {
      logger.error({ err, uuid, itemId: payloadItemId }, 'notification replay failed');
      await markNotificationFailure(uuid, err?.message ?? 'notification replay failed');
    }
  }
}

export function startNotificationWorker(options = {}) {
  if (workerHandle) {
    return workerHandle;
  }

  const configuredInterval = Number.parseInt(options.intervalMs ?? process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? '', 10);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_INTERVAL_MS;

  logger.info({ intervalMs }, 'starting notification worker');

  const tick = async () => {
    try {
      await processPendingNotifications();
    } catch (err) {
      logger.error({ err }, 'notification worker tick failed');
    }
  };

  workerHandle = setInterval(() => {
    tick().catch((err) => {
      logger.error({ err }, 'notification worker unhandled error');
    });
  }, intervalMs);

  // Kick off immediately without waiting for the first interval.
  tick().catch((err) => {
    logger.error({ err }, 'notification worker initial run failed');
  });

  return workerHandle;
}

export function stopNotificationWorker() {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
    logger.info({ msg: 'notification worker stopped' });
  }
}
