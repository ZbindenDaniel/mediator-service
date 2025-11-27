import type Database from 'better-sqlite3';
import {
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING,
  type AgenticRun,
  type AgenticRunCancelInput,
  type AgenticRunCancelResult,
  type AgenticRunRestartInput,
  type AgenticRunReviewMetadata,
  type AgenticRunStartInput,
  type AgenticRunStartResult,
  type AgenticRunStatusResult,
  type AgenticHealthStatus,
  type AgenticModelInvocationInput,
  type AgenticModelInvocationResult,
  type AgenticRequestContext,
  type AgenticHealthOptions
} from '../../models';
import {
  logAgenticRequestStart,
  logAgenticRequestEnd,
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure,
  updateQueuedAgenticRunQueueState,
  type AgenticRunQueueUpdate,
  type LogEventPayload
} from '../db';

export interface AgenticServiceLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export type AgenticModelInvokerFn = (
  input: AgenticModelInvocationInput
) => Promise<AgenticModelInvocationResult>;

export interface AgenticServiceDependencies {
  db: Database.Database;
  getAgenticRun: Database.Statement;
  upsertAgenticRun: Database.Statement;
  updateAgenticRunStatus: Database.Statement;
  updateQueuedAgenticRunQueueState?: (update: AgenticRunQueueUpdate) => void;
  logEvent: (payload: LogEventPayload) => void;
  updateAgenticReview?: Database.Statement;
  now?: () => Date;
  logger?: AgenticServiceLogger;
  invokeModel?: AgenticModelInvokerFn;
}

export interface AgenticRunResumeResult {
  resumed: number;
  skipped: number;
  failed: number;
}

type NormalizedRequestContext = {
  id: string;
  payloadDefined: boolean;
  payload: unknown;
  notificationDefined: boolean;
  notification: AgenticRequestContext['notification'];
};

type NormalizedReviewMetadata = AgenticRunReviewMetadata & { state: string | null };

const REQUEST_STATUS_SUCCESS = 'SUCCESS';
const REQUEST_STATUS_FAILED = 'FAILED';
const REQUEST_STATUS_DECLINED = 'DECLINED';
const REQUEST_STATUS_CANCELLED = 'CANCELLED';

// TODO(agentic-flag-normalization): Fold boolean-to-integer coercion into the shared DB layer
// once SQLite bindings accept native booleans in our migration plan.
type AgenticRunStatusFlag =
  | 'ReviewedByIsSet'
  | 'LastReviewDecisionIsSet'
  | 'LastReviewNotesIsSet'
  | 'RetryCountIsSet'
  | 'NextRetryAtIsSet'
  | 'LastErrorIsSet'
  | 'LastAttemptAtIsSet';

const AGENTIC_STATUS_UPDATE_FLAGS: AgenticRunStatusFlag[] = [
  'ReviewedByIsSet',
  'LastReviewDecisionIsSet',
  'LastReviewNotesIsSet',
  'RetryCountIsSet',
  'NextRetryAtIsSet',
  'LastErrorIsSet',
  'LastAttemptAtIsSet'
];

const SELECT_STALE_AGENTIC_RUNS_SQL = `
  SELECT Id, ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy,
         LastReviewDecision, LastReviewNotes, RetryCount, NextRetryAt, LastError, LastAttemptAt
    FROM agentic_runs
   WHERE Status IN ('queued', 'running')
   ORDER BY datetime(LastModified) ASC, Id ASC
`;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeRequestContext(request: AgenticRequestContext | null | undefined): NormalizedRequestContext | null {
  if (!request) {
    return null;
  }

  const trimmedId = typeof request.id === 'string' ? request.id.trim() : '';
  if (!trimmedId) {
    return null;
  }

  return {
    id: trimmedId,
    payloadDefined: Object.prototype.hasOwnProperty.call(request, 'payload'),
    payload: request.payload,
    notificationDefined: Object.prototype.hasOwnProperty.call(request, 'notification'),
    notification: request.notification ?? null
  };
}

function persistRequestPayloadSnapshot(
  request: NormalizedRequestContext | null,
  logger: AgenticServiceLogger
): void {
  if (!request || !request.payloadDefined) {
    return;
  }

  try {
    saveAgenticRequestPayload(request.id, request.payload ?? null);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to persist request payload snapshot', {
      requestId: request.id,
      error: toErrorMessage(err)
    });
  }
}

export function normalizeAgenticStatusUpdate(update: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...update };

  for (const flag of AGENTIC_STATUS_UPDATE_FLAGS) {
    if (Object.prototype.hasOwnProperty.call(normalized, flag)) {
      const value = normalized[flag];
      if (typeof value === 'boolean') {
        normalized[flag] = value ? 1 : 0;
      } else if (typeof value === 'number' || typeof value === 'bigint') {
        normalized[flag] = Number(value);
      } else {
        normalized[flag] = value ?? 0;
      }
    }
  }

  return normalized;
}

function recordRequestLogStart(
  request: NormalizedRequestContext | null,
  search: string | null,
  logger: AgenticServiceLogger
): void {
  if (!request) {
    return;
  }

  try {
    logAgenticRequestStart(request.id, search ?? null);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to persist request log start', {
      requestId: request.id,
      error: toErrorMessage(err)
    });
  }
}

function finalizeRequestLog(
  request: NormalizedRequestContext | null,
  status: string,
  error: string | null,
  logger: AgenticServiceLogger
): void {
  if (!request) {
    return;
  }

  try {
    logAgenticRequestEnd(request.id, status, error);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to persist request log completion', {
      requestId: request.id,
      status,
      error: error ?? null,
      persistenceError: toErrorMessage(err)
    });
  }

  if (!request.notificationDefined || !request.notification) {
    return;
  }

  const completedAt = request.notification.completedAt ?? null;
  const notificationError = request.notification.error ?? null;

  if (notificationError) {
    try {
      markAgenticRequestNotificationFailure(request.id, notificationError);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to persist request notification failure', {
        requestId: request.id,
        error: notificationError,
        persistenceError: toErrorMessage(err)
      });
    }
    return;
  }

  if (completedAt || notificationError === null) {
    try {
      markAgenticRequestNotificationSuccess(request.id, completedAt ?? null);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to persist request notification success', {
        requestId: request.id,
        completedAt,
        persistenceError: toErrorMessage(err)
      });
    }
  }
}

function resolveLogger(deps: AgenticServiceDependencies): AgenticServiceLogger {
  return deps.logger ?? console;
}

function resolveNow(deps: AgenticServiceDependencies): Date {
  const nowFactory = deps.now;
  try {
    return nowFactory ? nowFactory() : new Date();
  } catch (err) {
    (deps.logger ?? console).warn?.('[agentic-service] Failed to invoke custom now() factory; falling back to Date.now()', {
      error: err instanceof Error ? err.message : err
    });
    return new Date();
  }
}

function applyQueueUpdate(
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger,
  update: AgenticRunQueueUpdate
): void {
  const updateQueueState = deps.updateQueuedAgenticRunQueueState ?? updateQueuedAgenticRunQueueState;
  if (!updateQueueState) {
    return;
  }

  try {
    updateQueueState(update);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to persist queue metadata update', {
      itemId: update.ItemUUID,
      error: toErrorMessage(err)
    });
  }
}

// TODO(agentic-review-state): Align review state semantics with upstream contract once schema is formalized.
function normalizeReviewMetadata(
  review: AgenticRunReviewMetadata | null | undefined,
  fallback: AgenticRun | null,
  logger: AgenticServiceLogger
): NormalizedReviewMetadata | null {
  if (!review && !fallback) {
    return null;
  }

  const rawState =
    review && typeof (review as { state?: unknown }).state === 'string'
      ? ((review as { state?: string | null }).state ?? '').trim()
      : null;

  const base = review ?? {
    decision: fallback?.LastReviewDecision ?? null,
    notes: fallback?.LastReviewNotes ?? null,
    reviewedBy: fallback?.ReviewedBy ?? null
  };

  const decision = base.decision && base.decision.trim() ? base.decision.trim().toLowerCase() : null;
  const notes = base.notes && base.notes.trim() ? base.notes.trim() : null;
  const reviewedBy = base.reviewedBy && base.reviewedBy.trim() ? base.reviewedBy.trim() : null;
  const fallbackState = fallback?.ReviewState && fallback.ReviewState.trim() ? fallback.ReviewState.trim() : null;
  const state = rawState || fallbackState || null;

  logger.info?.('[agentic-service] Normalized review metadata', {
    provided: Boolean(review),
    normalizedDecision: decision,
    normalizedNotesPresent: Boolean(notes),
    normalizedReviewedBy: reviewedBy,
    normalizedState: state,
    fallbackState,
    fallbackReviewedBy: fallback?.ReviewedBy ?? null
  });

  return {
    decision,
    notes,
    reviewedBy,
    state
  };
}

function fetchAgenticRun(
  itemId: string,
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): AgenticRun | null {
  try {
    const result = deps.getAgenticRun.get(itemId) as AgenticRun | undefined;
    return result ?? null;
  } catch (err) {
    logger.error?.('[agentic-service] Failed to load agentic run', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
    throw err;
  }
}

function persistQueuedRun(
  payload: {
    itemId: string;
    searchQuery: string;
    actor: string | null;
    context: string | null;
    review: NormalizedReviewMetadata | null;
    created: boolean;
  },
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): AgenticRun | null {
  const now = resolveNow(deps).toISOString();
  const reviewDecision = payload.review?.decision ?? null;
  const reviewNotes = payload.review?.notes ?? null;
  const reviewState = payload.review?.state ?? 'not_required';
  const reviewedBy = payload.review?.reviewedBy ?? null;

  try {
    deps.upsertAgenticRun.run({
      ItemUUID: payload.itemId,
      SearchQuery: payload.searchQuery,
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: now,
      ReviewState: reviewState,
      ReviewedBy: reviewedBy,
      LastReviewDecision: reviewDecision,
      LastReviewNotes: reviewNotes
    });
  } catch (err) {
    logger.error?.('[agentic-service] Failed to upsert agentic run during queue', {
      itemId: payload.itemId,
      error: err instanceof Error ? err.message : err
    });
    throw err;
  }

  try {
    deps.logEvent({
      Actor: payload.actor,
      EntityType: 'Item',
      EntityId: payload.itemId,
      Event: payload.created ? 'AgenticRunQueued' : 'AgenticRunRequeued',
      Meta: JSON.stringify({
        searchQuery: payload.searchQuery,
        context: payload.context
      })
    });
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to persist agentic queue event', {
      itemId: payload.itemId,
      error: err instanceof Error ? err.message : err
    });
  }

  return fetchAgenticRun(payload.itemId, deps, logger);
}

// TODO(agent): Verify requestId forwarding into background invocations when telemetry hooks evolve.
// TODO(agentic-retries): Centralize retry bookkeeping/backoff settings once queue orchestration solidifies.
interface BackgroundInvocationPayload {
  itemId: string;
  searchQuery: string;
  context: string | null;
  review: AgenticRunReviewMetadata | null;
  request: NormalizedRequestContext | null;
  deps: AgenticServiceDependencies;
  logger: AgenticServiceLogger;
}

function scheduleAgenticModelInvocation(payload: BackgroundInvocationPayload): void {
  const { deps, logger } = payload;
  const invokeModel = deps.invokeModel;
  if (!invokeModel) {
    return;
  }

  const scheduler =
    typeof setImmediate === 'function'
      ? (fn: () => void) => setImmediate(fn)
      : (fn: () => void) => queueMicrotask(fn);

  // TODO(agentic-auto-cancel): Extract shared failure handling once retry support is introduced.
  const runInBackground = async () => {
    const now = resolveNow(deps);
    const nowIso = now.toISOString();
    let existingRun: AgenticRun | null = null;

    try {
      existingRun = fetchAgenticRun(payload.itemId, deps, logger);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to load existing run before invocation', {
        itemId: payload.itemId,
        context: payload.context,
        error: toErrorMessage(err)
      });
    }

    const nextRetryCount = (existingRun?.RetryCount ?? 0) + 1;
    const attemptTimestamp = nowIso;

    applyQueueUpdate(deps, logger, {
      ItemUUID: payload.itemId,
      Status: AGENTIC_RUN_STATUS_RUNNING,
      LastModified: nowIso,
      RetryCount: nextRetryCount,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: attemptTimestamp
    });

    try {
      const updateResult = deps.updateAgenticRunStatus.run(
        normalizeAgenticStatusUpdate({
          ItemUUID: payload.itemId,
          Status: AGENTIC_RUN_STATUS_RUNNING,
          SearchQuery: payload.searchQuery,
          LastModified: nowIso,
          ReviewState: 'not_required',
          ReviewedBy: payload.review?.reviewedBy ?? existingRun?.ReviewedBy ?? null,
          ReviewedByIsSet: true,
          LastReviewDecision: payload.review?.decision ?? null,
          LastReviewDecisionIsSet: true,
          LastReviewNotes: payload.review?.notes ?? null,
          LastReviewNotesIsSet: true,
          RetryCount: nextRetryCount,
          RetryCountIsSet: true,
          NextRetryAt: null,
          NextRetryAtIsSet: true,
          LastError: null,
          LastErrorIsSet: true,
          LastAttemptAt: attemptTimestamp,
          LastAttemptAtIsSet: true
        })
      );

      if (!updateResult?.changes) {
        logger.warn?.('[agentic-service] Agentic run mark-running updated zero rows', {
          itemId: payload.itemId
        });
      } else {
        logger.info?.('[agentic-service] Agentic run marked running prior to invocation', {
          itemId: payload.itemId,
          context: payload.context
        });
      }
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      logger.error?.('[agentic-service] Failed to mark agentic run running prior to invocation', {
        itemId: payload.itemId,
        context: payload.context,
        error: errorMessage
      });
      recordAgenticRequestLogUpdate(payload.request, AGENTIC_RUN_STATUS_FAILED, {
        error: errorMessage,
        searchQuery: payload.searchQuery,
        logger
      });
      return;
    }

    recordAgenticRequestLogUpdate(payload.request, AGENTIC_RUN_STATUS_RUNNING, {
      markRunning: true,
      searchQuery: payload.searchQuery,
      logger
    });

    const autoCancelAfterFailure = async (
      reason: string,
      message: string | null
    ): Promise<void> => {
      try {
        let existingRun: AgenticRun | null = null;
        try {
          existingRun = fetchAgenticRun(payload.itemId, deps, logger);
        } catch (loadErr) {
          logger.error?.('[agentic-service] Failed to load run during auto-cancel', {
            itemId: payload.itemId,
            reason,
            error: toErrorMessage(loadErr)
          });
        }

        const cancelTimestamp = resolveNow(deps).toISOString();
        const searchQuery = existingRun?.SearchQuery ?? payload.searchQuery;
        const lastDecision = existingRun?.LastReviewDecision ?? payload.review?.decision ?? null;
        const lastNotes = existingRun?.LastReviewNotes ?? payload.review?.notes ?? null;
        const retryCount = existingRun?.RetryCount ?? 0;
        const lastAttemptAt = existingRun?.LastAttemptAt ?? cancelTimestamp;
        const lastError = message ?? reason;

        applyQueueUpdate(deps, logger, {
          ItemUUID: payload.itemId,
          Status: AGENTIC_RUN_STATUS_CANCELLED,
          LastModified: cancelTimestamp,
          RetryCount: retryCount,
          NextRetryAt: null,
          LastError: lastError,
          LastAttemptAt: lastAttemptAt
        });

        try {
          const updateResult = deps.updateAgenticRunStatus.run(
            normalizeAgenticStatusUpdate({
              ItemUUID: payload.itemId,
              Status: AGENTIC_RUN_STATUS_CANCELLED,
              SearchQuery: searchQuery,
              LastModified: cancelTimestamp,
              ReviewState: 'not_required',
              ReviewedBy: null,
              ReviewedByIsSet: true,
              LastReviewDecision: lastDecision,
              LastReviewDecisionIsSet: true,
              LastReviewNotes: lastNotes,
              LastReviewNotesIsSet: true,
              RetryCount: retryCount,
              RetryCountIsSet: true,
              NextRetryAt: null,
              NextRetryAtIsSet: true,
              LastError: lastError,
              LastErrorIsSet: true,
              LastAttemptAt: lastAttemptAt,
              LastAttemptAtIsSet: true
            })
          );

          if (!updateResult?.changes) {
            logger.warn?.('[agentic-service] Auto-cancel updated zero rows after failure', {
              itemId: payload.itemId,
              reason
            });
          } else {
            logger.info?.('[agentic-service] Agentic run auto-cancelled after failure', {
              itemId: payload.itemId,
              reason
            });
          }
        } catch (updateErr) {
          logger.error?.('[agentic-service] Failed to auto-cancel agentic run after failure', {
            itemId: payload.itemId,
            reason,
            error: toErrorMessage(updateErr)
          });
        }

        try {
          deps.logEvent({
            Actor: 'agentic-service',
            EntityType: 'Item',
            EntityId: payload.itemId,
            Event: 'AgenticRunCancelled',
            Meta: JSON.stringify({
              previousStatus: existingRun?.Status ?? null,
              cancelledAt: cancelTimestamp,
              reason,
              error: message
            })
          });
        } catch (eventErr) {
          logger.error?.('[agentic-service] Failed to record auto-cancel event after failure', {
            itemId: payload.itemId,
            reason,
            error: toErrorMessage(eventErr)
          });
        }
      } catch (err) {
        logger.error?.('[agentic-service] Auto-cancel workflow threw after failure', {
          itemId: payload.itemId,
          reason,
          error: toErrorMessage(err)
        });
      }
    };

    try {
      const result = await invokeModel({
        itemId: payload.itemId,
        searchQuery: payload.searchQuery,
        context: payload.context,
        review: payload.review,
        requestId: payload.request?.id ?? null
      });
      if (!result?.ok) {
        const failureMessage = typeof result?.message === 'string' ? result.message : null;
        logger.error?.('[agentic-service] Model invocation returned failure result', {
          itemId: payload.itemId,
          context: payload.context,
          error: failureMessage
        });
        recordAgenticRequestLogUpdate(payload.request, AGENTIC_RUN_STATUS_FAILED, {
          error: failureMessage ?? 'invocation-failed',
          searchQuery: payload.searchQuery,
          logger
        });
        await autoCancelAfterFailure('invocation-result-not-ok', failureMessage);
        return;
      }
      logger.info?.('[agentic-service] Model invocation dispatched asynchronously', {
        itemId: payload.itemId,
        context: payload.context
      });
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      logger.error?.('[agentic-service] Model invocation failed during asynchronous dispatch', {
        itemId: payload.itemId,
        context: payload.context,
        error: errorMessage
      });
      recordAgenticRequestLogUpdate(payload.request, AGENTIC_RUN_STATUS_FAILED, {
        error: errorMessage,
        searchQuery: payload.searchQuery,
        logger
      });
      await autoCancelAfterFailure('invocation-dispatch-error', errorMessage);
    }
  };

  try {
    scheduler(() => {
      void runInBackground();
    });
  } catch (err) {
    const errorMessage = toErrorMessage(err);
    logger.error?.('[agentic-service] Failed to schedule asynchronous model invocation', {
      itemId: payload.itemId,
      context: payload.context,
      error: errorMessage
    });
    recordAgenticRequestLogUpdate(payload.request, AGENTIC_RUN_STATUS_FAILED, {
      error: errorMessage,
      searchQuery: payload.searchQuery,
      logger
    });
  }
}

function validateDependencies(deps: AgenticServiceDependencies): void {
  if (!deps?.db || !deps.getAgenticRun || !deps.upsertAgenticRun || !deps.updateAgenticRunStatus || !deps.logEvent) {
    throw new Error('Agentic service dependencies are incomplete');
  }
}

export async function startAgenticRun(
  input: AgenticRunStartInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStartResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(input.request ?? null);
  persistRequestPayloadSnapshot(request, logger);
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] startAgenticRun missing itemId', { context: input.context ?? null });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-item-id', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] startAgenticRun missing search query', { itemId, context: input.context ?? null });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, existing, logger);
  try {
    recordRequestLogStart(request, searchQuery, logger);
    const agentic = persistQueuedRun(
      {
        itemId,
        searchQuery,
        actor: input.actor?.trim() || null,
        context: input.context?.trim() || null,
        review,
        created: !existing
      },
      deps,
      logger
    );

    recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
      searchQuery,
      logger
    });

    scheduleAgenticModelInvocation({
      itemId,
      searchQuery,
      context: input.context?.trim() || null,
      review,
      request,
      deps,
      logger
    });

    logger.info?.('[agentic-service] Agentic run queued for asynchronous execution', {
      itemId,
      context: input.context ?? null
    });
    return { agentic, queued: true, created: !existing };
  } catch (err) {
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }
}

export async function cancelAgenticRun(
  input: AgenticRunCancelInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunCancelResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(input.request ?? null);
  persistRequestPayloadSnapshot(request, logger);
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] cancelAgenticRun missing itemId');
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-item-id', logger);
    return { cancelled: false, agentic: null, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] cancelAgenticRun attempted without existing run', { itemId });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-found', logger);
    return { cancelled: false, agentic: null, reason: 'not-found' };
  }

  const nowIso = resolveNow(deps).toISOString();
  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);
  const txn = deps.db.transaction((actor: string) => {
    const retryCount = existing.RetryCount ?? 0;
    const lastAttemptAt = existing.LastAttemptAt ?? nowIso;
    const lastError = existing.LastError ?? null;

    applyQueueUpdate(deps, logger, {
      ItemUUID: itemId,
      Status: AGENTIC_RUN_STATUS_CANCELLED,
      LastModified: nowIso,
      RetryCount: retryCount,
      NextRetryAt: null,
      LastError: lastError,
      LastAttemptAt: lastAttemptAt
    });

    const updateResult = deps.updateAgenticRunStatus.run(
      normalizeAgenticStatusUpdate({
        ItemUUID: itemId,
        Status: AGENTIC_RUN_STATUS_CANCELLED,
        SearchQuery: existing.SearchQuery ?? null,
        LastModified: nowIso,
        ReviewState: 'not_required',
        ReviewedBy: null,
        ReviewedByIsSet: true,
        LastReviewDecision: existing.LastReviewDecision ?? null,
        LastReviewDecisionIsSet: true,
        LastReviewNotes: existing.LastReviewNotes ?? null,
        LastReviewNotesIsSet: true,
        RetryCount: retryCount,
        RetryCountIsSet: true,
        NextRetryAt: null,
        NextRetryAtIsSet: true,
        LastError: lastError,
        LastErrorIsSet: true,
        LastAttemptAt: lastAttemptAt,
        LastAttemptAtIsSet: true
      })
    );
    if (!updateResult?.changes) {
      throw new Error('Failed to cancel agentic run');
    }

    deps.logEvent({
      Actor: actor,
      EntityType: 'Item',
      EntityId: itemId,
      Event: 'AgenticRunCancelled',
      Meta: JSON.stringify({
        previousStatus: existing.Status ?? null,
        cancelledAt: nowIso,
        reason: input.reason ?? null
      })
    });
  });

  try {
    txn((input.actor || '').trim());
    finalizeRequestLog(request, REQUEST_STATUS_CANCELLED, null, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to cancel agentic run', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = fetchAgenticRun(itemId, deps, logger);
  return { cancelled: true, agentic: refreshed };
}

export async function restartAgenticRun(
  input: AgenticRunRestartInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStartResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(input.request ?? null);
  persistRequestPayloadSnapshot(request, logger);
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] restartAgenticRun missing itemId', { context: input.context ?? null });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-item-id', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] restartAgenticRun missing search query', { itemId, context: input.context ?? null });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, existing, logger);
  const nowIso = resolveNow(deps).toISOString();
  const actor = input.actor?.trim() || null;
  const context = input.context?.trim() || null;
  recordRequestLogStart(request, searchQuery, logger);
  const txn = deps.db.transaction(() => {
    if (existing) {
      const updateResult = deps.updateAgenticRunStatus.run(
        normalizeAgenticStatusUpdate({
          ItemUUID: itemId,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          SearchQuery: searchQuery,
          LastModified: nowIso,
          ReviewState: review?.state ?? existing?.ReviewState ?? 'not_required',
          ReviewedBy: review?.reviewedBy ?? existing?.ReviewedBy ?? null,
          ReviewedByIsSet: true,
          LastReviewDecision: review?.decision ?? null,
          LastReviewDecisionIsSet: true,
          LastReviewNotes: review?.notes ?? null,
          LastReviewNotesIsSet: true,
          RetryCount: 0,
          RetryCountIsSet: true,
          NextRetryAt: null,
          NextRetryAtIsSet: true,
          LastError: null,
          LastErrorIsSet: true,
          LastAttemptAt: null,
          LastAttemptAtIsSet: true
        })
      );
      if (!updateResult?.changes) {
        throw new Error('Failed to reset agentic run');
      }
    } else {
      deps.upsertAgenticRun.run({
        ItemUUID: itemId,
        SearchQuery: searchQuery,
        Status: AGENTIC_RUN_STATUS_QUEUED,
        LastModified: nowIso,
        ReviewState: review?.state ?? existing?.ReviewState ?? 'not_required',
        ReviewedBy: review?.reviewedBy ?? existing?.ReviewedBy ?? null,
        LastReviewDecision: review?.decision ?? null,
        LastReviewNotes: review?.notes ?? null
      });
    }

    deps.logEvent({
      Actor: actor,
      EntityType: 'Item',
      EntityId: itemId,
      Event: 'AgenticRunRestarted',
      Meta: JSON.stringify({
        previousStatus: input.previousStatus ?? existing?.Status ?? null,
        searchQuery,
        context,
        lastReviewDecision: review?.decision ?? null,
        lastReviewNotes: review?.notes ?? null,
        lastReviewActor: review?.reviewedBy ?? null
      })
    });
  });

  try {
    txn();
  } catch (err) {
    logger.error?.('[agentic-service] Failed to restart agentic run', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = fetchAgenticRun(itemId, deps, logger);

  recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
    searchQuery,
    logger
  });

  scheduleAgenticModelInvocation({
    itemId,
    searchQuery,
    context,
    review,
    request,
    deps,
    logger
  });

  logger.info?.('[agentic-service] Agentic run restart queued for asynchronous execution', {
    itemId,
    context
  });

  return { agentic: refreshed, queued: true, created: !existing };
}

export function resumeAgenticRun(
  input: AgenticRunRestartInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStartResult> {
  return restartAgenticRun(input, deps);
}

function resolveReviewFromPersistedRun(run: AgenticRun | null): AgenticRunReviewMetadata | null {
  if (!run) {
    return null;
  }

  const decision = run.LastReviewDecision ?? null;
  const notes = run.LastReviewNotes ?? null;
  const reviewedBy = run.ReviewedBy ?? null;

  if (!decision && !notes && !reviewedBy) {
    return null;
  }

  return { decision, notes, reviewedBy };
}

// TODO(agentic-resume): Persist request context metadata to forward during resume once storage exists.
export async function resumeStaleAgenticRuns(
  deps: AgenticServiceDependencies
): Promise<AgenticRunResumeResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);

  let staleRuns: AgenticRun[] = [];
  try {
    const statement = deps.db.prepare(SELECT_STALE_AGENTIC_RUNS_SQL);
    staleRuns = statement.all() as AgenticRun[];
  } catch (err) {
    logger.error?.('[agentic-service] Failed to query stale agentic runs during resume', {
      error: toErrorMessage(err)
    });
    return { resumed: 0, skipped: 0, failed: 1 };
  }

  if (staleRuns.length === 0) {
    logger.info?.('[agentic-service] No stale agentic runs detected during startup resume.');
    return { resumed: 0, skipped: 0, failed: 0 };
  }

  logger.info?.('[agentic-service] Resuming stale agentic runs after restart', {
    count: staleRuns.length
  });

  let resumed = 0;
  let skipped = 0;
  let failed = 0;

  for (const run of staleRuns) {
    const searchQuery = (run.SearchQuery || '').trim();
    if (!searchQuery) {
      skipped += 1;
      logger.warn?.('[agentic-service] Skipping stale agentic run without search query', {
        itemId: run.ItemUUID,
        status: run.Status
      });
      continue;
    }

    try {
      scheduleAgenticModelInvocation({
        itemId: run.ItemUUID,
        searchQuery,
        context: null,
        review: resolveReviewFromPersistedRun(run),
        request: null,
        deps,
        logger
      });
      resumed += 1;
    } catch (err) {
      failed += 1;
      logger.error?.('[agentic-service] Failed to schedule stale agentic run during resume', {
        itemId: run.ItemUUID,
        status: run.Status,
        error: toErrorMessage(err)
      });
    }
  }

  logger.info?.('[agentic-service] Completed stale agentic run resume sweep', {
    resumed,
    skipped,
    failed
  });

  return { resumed, skipped, failed };
}

export interface AgenticRequestLogUpdateOptions {
  searchQuery?: string | null;
  error?: string | null;
  markRunning?: boolean;
  logger?: AgenticServiceLogger;
}

export function recordAgenticRequestLogUpdate(
  request: AgenticRequestContext | null | undefined,
  status: string,
  options: AgenticRequestLogUpdateOptions = {}
): void {
  const logger = options.logger ?? console;
  const normalized = normalizeRequestContext(request);
  if (!normalized) {
    return;
  }

  persistRequestPayloadSnapshot(normalized, logger);
  if (options.markRunning) {
    recordRequestLogStart(normalized, options.searchQuery ?? null, logger);
  }
  finalizeRequestLog(normalized, status, options.error ?? null, logger);
}

export function getAgenticStatus(
  itemId: string,
  deps: AgenticServiceDependencies
): AgenticRunStatusResult {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const trimmed = (itemId || '').trim();
  if (!trimmed) {
    logger.warn?.('[agentic-service] getAgenticStatus missing itemId');
    return { agentic: null };
  }

  return { agentic: fetchAgenticRun(trimmed, deps, logger) };
}

export function checkAgenticHealth(
  deps: AgenticServiceDependencies,
  options: AgenticHealthOptions = {}
): AgenticHealthStatus {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(options.request ?? null);
  persistRequestPayloadSnapshot(request, logger);

  try {
    recordRequestLogStart(request, null, logger);
    const statement = deps.db.prepare(
      `SELECT Status as status, COUNT(*) as count, MAX(LastModified) as lastModified
         FROM agentic_runs
        GROUP BY Status`
    );
    const rows = statement.all() as Array<{ status: string; count: number; lastModified: string | null }>;
    let queuedRuns = 0;
    let runningRuns = 0;
    let lastUpdatedAt: string | null = null;

    for (const row of rows) {
      if (row.status === AGENTIC_RUN_STATUS_QUEUED) {
        queuedRuns += row.count ?? 0;
      }
      if (row.status === AGENTIC_RUN_STATUS_RUNNING) {
        runningRuns += row.count ?? 0;
      }
      if (row.lastModified && (!lastUpdatedAt || row.lastModified > lastUpdatedAt)) {
        lastUpdatedAt = row.lastModified;
      }
    }

    const status: AgenticHealthStatus = {
      ok: true,
      queuedRuns,
      runningRuns,
      lastUpdatedAt
    };
    finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
    return status;
  } catch (err) {
    logger.error?.('[agentic-service] Failed to compute agentic health', {
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    return {
      ok: false,
      queuedRuns: 0,
      runningRuns: 0,
      lastUpdatedAt: null,
      message: err instanceof Error ? err.message : String(err)
    };
  }
}
