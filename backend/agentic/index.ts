import type Database from 'better-sqlite3';
import {
  AGENTIC_RUN_STATUS_CANCELLED,
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
  logEvent: (payload: LogEventPayload) => void;
  updateAgenticReview?: Database.Statement;
  now?: () => Date;
  logger?: AgenticServiceLogger;
  invokeModel?: AgenticModelInvokerFn;
}

type NormalizedRequestContext = {
  id: string;
  payloadDefined: boolean;
  payload: unknown;
  notificationDefined: boolean;
  notification: AgenticRequestContext['notification'];
};

const REQUEST_STATUS_SUCCESS = 'SUCCESS';
const REQUEST_STATUS_FAILED = 'FAILED';
const REQUEST_STATUS_DECLINED = 'DECLINED';
const REQUEST_STATUS_CANCELLED = 'CANCELLED';

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

function normalizeReviewMetadata(
  review: AgenticRunReviewMetadata | null | undefined,
  fallback: AgenticRun | null
): AgenticRunReviewMetadata | null {
  if (!review && !fallback) {
    return null;
  }

  const base = review ?? {
    decision: fallback?.LastReviewDecision ?? null,
    notes: fallback?.LastReviewNotes ?? null,
    reviewedBy: fallback?.ReviewedBy ?? null
  };

  const decision = base.decision && base.decision.trim() ? base.decision.trim().toLowerCase() : null;
  const notes = base.notes && base.notes.trim() ? base.notes.trim() : null;
  const reviewedBy = base.reviewedBy && base.reviewedBy.trim() ? base.reviewedBy.trim() : null;

  return {
    decision,
    notes,
    reviewedBy
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
    review: AgenticRunReviewMetadata | null;
    created: boolean;
  },
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): AgenticRun | null {
  const now = resolveNow(deps).toISOString();
  const reviewDecision = payload.review?.decision ?? null;
  const reviewNotes = payload.review?.notes ?? null;

  try {
    deps.upsertAgenticRun.run({
      ItemUUID: payload.itemId,
      SearchQuery: payload.searchQuery,
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: now,
      ReviewState: 'not_required',
      ReviewedBy: null,
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

  const review = normalizeReviewMetadata(input.review ?? null, existing);
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

    if (deps.invokeModel) {
      try {
        await deps.invokeModel({
          itemId,
          searchQuery,
          context: input.context ?? null,
          review
        });
        logger.info?.('[agentic-service] Model invocation dispatched', { itemId, context: input.context ?? null });
      } catch (err) {
        logger.error?.('[agentic-service] Model invocation failed during startAgenticRun', {
          itemId,
          error: err instanceof Error ? err.message : err
        });
        throw err;
      }
    }

    finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
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
    const updateResult = deps.updateAgenticRunStatus.run({
      ItemUUID: itemId,
      Status: AGENTIC_RUN_STATUS_CANCELLED,
      SearchQuery: existing.SearchQuery ?? null,
      LastModified: nowIso,
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: existing.LastReviewDecision ?? null,
      LastReviewNotes: existing.LastReviewNotes ?? null
    });
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

  const review = normalizeReviewMetadata(input.review ?? null, existing);
  const nowIso = resolveNow(deps).toISOString();
  const actor = input.actor?.trim() || null;
  const context = input.context?.trim() || null;
  recordRequestLogStart(request, searchQuery, logger);
  const txn = deps.db.transaction(() => {
    if (existing) {
      const updateResult = deps.updateAgenticRunStatus.run({
        ItemUUID: itemId,
        Status: AGENTIC_RUN_STATUS_QUEUED,
        SearchQuery: searchQuery,
        LastModified: nowIso,
        ReviewState: 'not_required',
        ReviewedBy: null,
        LastReviewDecision: review?.decision ?? null,
        LastReviewNotes: review?.notes ?? null
      });
      if (!updateResult?.changes) {
        throw new Error('Failed to reset agentic run');
      }
    } else {
      deps.upsertAgenticRun.run({
        ItemUUID: itemId,
        SearchQuery: searchQuery,
        Status: AGENTIC_RUN_STATUS_QUEUED,
        LastModified: nowIso,
        ReviewState: 'not_required',
        ReviewedBy: null,
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

  if (deps.invokeModel) {
    try {
      await deps.invokeModel({
        itemId,
        searchQuery,
        context,
        review
      });
      logger.info?.('[agentic-service] Model invocation dispatched after restart', { itemId, context });
    } catch (err) {
      logger.error?.('[agentic-service] Model invocation failed during restartAgenticRun', {
        itemId,
        error: err instanceof Error ? err.message : err
      });
      finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
      throw err;
    }
  }

  finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
  return { agentic: refreshed, queued: true, created: !existing };
}

export function resumeAgenticRun(
  input: AgenticRunRestartInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStartResult> {
  return restartAgenticRun(input, deps);
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
