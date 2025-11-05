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
  type AgenticModelInvocationResult
} from '../../models';
import type { LogEventPayload } from '../db';

export interface AgenticServiceLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export type AgenticModelInvoker = (
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
  invokeModel?: AgenticModelInvoker;
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
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] startAgenticRun missing itemId', { context: input.context ?? null });
    return { agentic: null, queued: false, created: false, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] startAgenticRun missing search query', { itemId, context: input.context ?? null });
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, existing);
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

  return { agentic, queued: true, created: !existing };
}

export async function cancelAgenticRun(
  input: AgenticRunCancelInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunCancelResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] cancelAgenticRun missing itemId');
    return { cancelled: false, agentic: null, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] cancelAgenticRun attempted without existing run', { itemId });
    return { cancelled: false, agentic: null, reason: 'not-found' };
  }

  const nowIso = resolveNow(deps).toISOString();
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
  } catch (err) {
    logger.error?.('[agentic-service] Failed to cancel agentic run', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
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
  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] restartAgenticRun missing itemId', { context: input.context ?? null });
    return { agentic: null, queued: false, created: false, reason: 'missing-item-id' };
  }

  const existing = fetchAgenticRun(itemId, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] restartAgenticRun missing search query', { itemId, context: input.context ?? null });
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, existing);
  const nowIso = resolveNow(deps).toISOString();
  const actor = input.actor?.trim() || null;
  const context = input.context?.trim() || null;
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
      throw err;
    }
  }

  return { agentic: refreshed, queued: true, created: !existing };
}

export function resumeAgenticRun(
  input: AgenticRunRestartInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStartResult> {
  return restartAgenticRun(input, deps);
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

export function checkAgenticHealth(deps: AgenticServiceDependencies): AgenticHealthStatus {
  validateDependencies(deps);
  const logger = resolveLogger(deps);

  try {
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

    return {
      ok: true,
      queuedRuns,
      runningRuns,
      lastUpdatedAt
    };
  } catch (err) {
    logger.error?.('[agentic-service] Failed to compute agentic health', {
      error: err instanceof Error ? err.message : err
    });
    return {
      ok: false,
      queuedRuns: 0,
      runningRuns: 0,
      lastUpdatedAt: null,
      message: err instanceof Error ? err.message : String(err)
    };
  }
}

// TODO(agentic-service): Integrate request log upserts once the ai-flow orchestration migrates fully in-process.
