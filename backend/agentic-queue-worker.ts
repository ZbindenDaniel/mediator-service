import type { AgenticRun } from '../models';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../models';
import {
  fetchQueuedAgenticRuns,
  getItem,
  updateQueuedAgenticRunQueueState,
  type AgenticRunQueueUpdate
} from './db';
import { forwardAgenticTrigger, type AgenticRunTriggerPayload } from './actions/agentic-trigger';
import type { Item } from './db';

export interface AgenticQueueWorkerLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface AgenticQueueWorkerOptions {
  agenticApiBase: string;
  limit?: number;
  logger?: AgenticQueueWorkerLogger;
  now?: () => Date;
  forwardTrigger?: typeof forwardAgenticTrigger;
}

const DEFAULT_LIMIT = 5;
const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export function computeRetryDelayMs(retryCount: number): number {
  const exponent = Math.max(0, retryCount - 1);
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, exponent);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function safeSerializeError(err: unknown): string {
  if (!err) {
    return 'Unknown error';
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err instanceof Error && typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch (stringifyError) {
    return String(err ?? stringifyError);
  }
}

function determineArtikelbeschreibung(run: AgenticRun, logger: AgenticQueueWorkerLogger | undefined): string | null {
  if (run.SearchQuery && run.SearchQuery.trim()) {
    return run.SearchQuery;
  }

  let item: Item | undefined;
  try {
    item = getItem.get(run.ItemUUID) as Item | undefined;
  } catch (err) {
    logger?.error?.('[agentic-worker] Failed to fetch item for agentic run', { itemId: run.ItemUUID, error: err });
  }

  const artikelbeschreibung = item?.Artikelbeschreibung;
  if (!artikelbeschreibung) {
    logger?.warn?.('[agentic-worker] Missing artikelbeschreibung for agentic run', { itemId: run.ItemUUID });
    return null;
  }

  return artikelbeschreibung;
}

function shouldAttemptNow(run: AgenticRun, attemptTime: Date): boolean {
  if (!run.NextRetryAt) {
    return true;
  }
  const nextRetryTimestamp = Date.parse(run.NextRetryAt);
  if (Number.isNaN(nextRetryTimestamp)) {
    return true;
  }
  return nextRetryTimestamp <= attemptTime.getTime();
}

export async function processQueuedAgenticRuns(options: AgenticQueueWorkerOptions): Promise<void> {
  const logger = options.logger ?? console;
  const forward = options.forwardTrigger ?? forwardAgenticTrigger;
  const limit = options.limit ?? DEFAULT_LIMIT;

  let runs: AgenticRun[] = [];
  try {
    runs = fetchQueuedAgenticRuns(limit);
  } catch (err) {
    logger.error?.('[agentic-worker] Failed to load queued agentic runs', err);
    return;
  }

  if (!runs.length) {
    return;
  }

  for (const run of runs) {
    const attemptTime = options.now?.() ?? new Date();
    if (!shouldAttemptNow(run, attemptTime)) {
      continue;
    }

    const artikelbeschreibung = determineArtikelbeschreibung(run, logger);
    if (!artikelbeschreibung) {
      const newRetryCount = run.RetryCount + 1;
      const backoffMs = computeRetryDelayMs(newRetryCount);
      const nextRetryAt = new Date(attemptTime.getTime() + backoffMs).toISOString();
      recordQueueUpdate(
        {
          ItemUUID: run.ItemUUID,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          LastModified: attemptTime.toISOString(),
          RetryCount: newRetryCount,
          NextRetryAt: nextRetryAt,
          LastError: 'Missing artikelbeschreibung for agentic trigger dispatch',
          LastAttemptAt: attemptTime.toISOString()
        },
        logger
      );
      continue;
    }

    const payload: AgenticRunTriggerPayload = {
      itemId: run.ItemUUID,
      artikelbeschreibung
    };
    const review = {
      decision: run.LastReviewDecision ?? null,
      notes: run.LastReviewNotes ?? null,
      reviewedBy: run.ReviewedBy ?? null
    };
    const hasReviewMetadata = Boolean(
      (review.decision && review.decision.trim()) ||
        (review.notes && review.notes.trim()) ||
        (review.reviewedBy && review.reviewedBy.trim())
    );
    if (hasReviewMetadata) {
      payload.review = review;
    }

    try {
      const result = await forward(payload, {
        context: 'agentic-queue-worker',
        agenticApiBase: options.agenticApiBase
      });

      if (result.ok) {
        const completionTime = options.now?.() ?? new Date();
        recordQueueUpdate(
          {
            ItemUUID: run.ItemUUID,
            Status: AGENTIC_RUN_STATUS_RUNNING,
            LastModified: completionTime.toISOString(),
            RetryCount: 0,
            NextRetryAt: null,
            LastError: null,
            LastAttemptAt: attemptTime.toISOString()
          },
          logger
        );
        logger.info?.('[agentic-worker] Forwarded queued agentic run', { itemId: run.ItemUUID });
        continue;
      }

      const failureSummary =
        typeof result.body === 'string'
          ? result.body
          : result.body
          ? safeSerializeError(result.body)
          : result.rawBody
          ? safeSerializeError(result.rawBody)
          : `Agentic trigger failed with status ${result.status ?? 'unknown'}`;

      handleForwardingFailure(run, attemptTime, failureSummary, logger);
    } catch (err) {
      const errorSummary = safeSerializeError(err);
      handleForwardingFailure(run, attemptTime, errorSummary, logger);
    }
  }
}

function recordQueueUpdate(update: AgenticRunQueueUpdate, logger: AgenticQueueWorkerLogger | undefined): void {
  try {
    updateQueuedAgenticRunQueueState(update);
  } catch (err) {
    logger?.error?.('[agentic-worker] Failed to persist agentic queue update', { itemId: update.ItemUUID, error: err });
  }
}

function handleForwardingFailure(
  run: AgenticRun,
  attemptTime: Date,
  errorSummary: string,
  logger: AgenticQueueWorkerLogger | undefined
): void {
  const newRetryCount = run.RetryCount + 1;
  const backoffMs = computeRetryDelayMs(newRetryCount);
  const nextRetryAt = new Date(attemptTime.getTime() + backoffMs).toISOString();

  logger?.error?.('[agentic-worker] Failed to forward agentic run', {
    itemId: run.ItemUUID,
    error: errorSummary,
    retryCount: newRetryCount,
    nextRetryAt
  });

  recordQueueUpdate(
    {
      ItemUUID: run.ItemUUID,
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: attemptTime.toISOString(),
      RetryCount: newRetryCount,
      NextRetryAt: nextRetryAt,
      LastError: errorSummary,
      LastAttemptAt: attemptTime.toISOString()
    },
    logger
  );
}

export type { AgenticRunQueueUpdate };
