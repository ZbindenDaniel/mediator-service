/**
 * TODO(agentic-result-handler): consider extracting shared validation helpers
 * if additional result endpoints are introduced.
 */
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  AGENTIC_RUN_RESTARTABLE_STATUSES,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  normalizeAgenticRunStatus,
  type AgenticRun,
  type AgenticRequestContext,
  type AgenticRequestLog,
  type Item
} from '../../models';
import { recordAgenticRequestLogUpdate } from '../agentic';
import { resolveAgenticRequestContext } from '../actions/agentic-request-context';

export interface AgenticResultLogger {
  error?: Console['error'];
  warn?: Console['warn'];
  info?: Console['info'];
  debug?: Console['debug'];
}

export interface AgenticResultHandlerContext {
  db: {
    transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>) => ReturnType<T>;
  };
  getItem: { get: (itemId: string) => Item | undefined };
  getAgenticRun: { get: (itemId: string) => AgenticRun | undefined };
  persistItemWithinTransaction: (item: Item) => void;
  updateAgenticRunStatus: { run: (update: Record<string, unknown>) => { changes?: number } };
  upsertAgenticRun: { run: (update: Record<string, unknown>) => unknown };
  logEvent: (event: {
    Actor: string;
    EntityType: string;
    EntityId: string;
    Event: string;
    Meta: string;
  }) => void;
  getAgenticRequestLog?: (requestId: string) => AgenticRequestLog | null;
}

export interface AgenticResultHandlerInput {
  itemId: string;
  payload: unknown;
}

export interface AgenticResultHandlerDependencies {
  ctx: AgenticResultHandlerContext;
  logger?: AgenticResultLogger;
}

export interface AgenticResultHandlerSuccess {
  status: string;
  requestContext: AgenticRequestContext | null;
  searchQuery: string | null;
  errorMessage: string | null;
}

export class AgenticResultProcessingError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: unknown;
  public readonly requestContext: AgenticRequestContext | null;

  constructor(
    message: string,
    statusCode: number,
    responseBody: unknown,
    requestContext: AgenticRequestContext | null
  ) {
    super(message);
    this.name = 'AgenticResultProcessingError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.requestContext = requestContext;
  }
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return null;
  }
  return null;
}

function normalizePublishedStatus(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (typeof value === 'string') {
    return ['yes', 'ja', 'true', '1'].includes(value.trim().toLowerCase()) ? 'yes' : 'no';
  }
  return 'no';
}

function loadAgenticRequestLog(
  ctx: AgenticResultHandlerContext,
  requestId: string,
  logger: AgenticResultLogger | undefined
): AgenticRequestLog | null {
  if (typeof ctx.getAgenticRequestLog !== 'function') {
    logger?.error?.('Agentic result missing getAgenticRequestLog dependency');
    throw new AgenticResultProcessingError(
      'agentic-request-log-accessor-missing',
      500,
      { error: 'Server misconfigured' },
      null
    );
  }

  try {
    return ctx.getAgenticRequestLog(requestId) ?? null;
  } catch (err) {
    logger?.error?.('Agentic result failed to load request log', {
      requestId,
      error: err instanceof Error ? err.message : err
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function resolveInitialSearch(
  payload: Record<string, unknown>,
  requestLog: AgenticRequestLog | null
): string | null {
  if (typeof payload.search === 'string' && payload.search.trim()) {
    return payload.search.trim();
  }
  if (requestLog?.Search && requestLog.Search.trim()) {
    return requestLog.Search.trim();
  }
  return null;
}

export function handleAgenticResult(
  input: AgenticResultHandlerInput,
  deps: AgenticResultHandlerDependencies
): AgenticResultHandlerSuccess {
  const logger = deps.logger ?? console;
  const { ctx } = deps;
  const itemId = input.itemId?.trim() ?? '';
  if (!itemId) {
    logger.error?.('Agentic result missing item id');
    throw new AgenticResultProcessingError('invalid-item-id', 400, { error: 'Invalid item id' }, null);
  }

  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const requestContext = resolveAgenticRequestContext(payload, itemId);
  const requestId = requestContext?.id?.trim() ?? '';

  if (!requestId) {
    logger.warn?.('Agentic result rejected due to missing request id', { itemId });
    recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
      error: 'request-id-required',
      logger
    });
    throw new AgenticResultProcessingError('request-id-required', 403, { error: 'Unauthorized' }, requestContext);
  }

  let requestLog: AgenticRequestLog | null = null;
  try {
    requestLog = loadAgenticRequestLog(ctx, requestId, logger);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'agentic-request-log-accessor-missing') {
      throw new AgenticResultProcessingError(message, 500, { error: 'Server misconfigured' }, requestContext);
    }
    recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
      error: 'request-log-load-failed',
      logger
    });
    throw new AgenticResultProcessingError('request-log-load-failed', 500, { error: 'Internal error' }, requestContext);
  }

  if (!requestLog) {
    logger.warn?.('Agentic result rejected due to unknown request id', { itemId, requestId });
    recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
      error: 'request-log-not-found',
      logger
    });
    throw new AgenticResultProcessingError('request-log-not-found', 403, { error: 'Unauthorized' }, requestContext);
  }

  let searchQueryForLog: string | null = null;
  if (requestLog.Search && requestLog.Search.trim()) {
    searchQueryForLog = requestLog.Search.trim();
  }

  if (!payload || typeof payload !== 'object') {
    logger.warn?.('Agentic result missing payload object');
    recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
      error: 'payload-required',
      markRunning: true,
      searchQuery: searchQueryForLog,
      logger
    });
    throw new AgenticResultProcessingError('payload-required', 400, { error: 'Payload is required' }, requestContext);
  }

  const initialSearch = resolveInitialSearch(payload, requestLog);
  recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_RUNNING, {
    markRunning: true,
    searchQuery: initialSearch,
    logger
  });

  const statusInput = typeof payload.status === 'string' ? payload.status : '';
  const normalizedIncomingStatus = normalizeAgenticRunStatus(statusInput);
  const errorMessage = typeof payload.error === 'string' ? payload.error.trim() || null : null;
  const needsReview = Boolean(payload.needsReview);
  const summaryInput = typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : null;
  const reviewDecisionInput =
    typeof payload.reviewDecision === 'string' && payload.reviewDecision.trim()
      ? payload.reviewDecision.trim().toLowerCase()
      : null;
  const reviewNotesInput =
    typeof payload.reviewNotes === 'string' && payload.reviewNotes.trim() ? payload.reviewNotes.trim() : null;
  const reviewedByInput = typeof payload.reviewedBy === 'string' && payload.reviewedBy.trim() ? payload.reviewedBy.trim() : null;
  const agenticActor = typeof payload.actor === 'string' && payload.actor ? payload.actor : 'agentic-service';

  let statusForPersistence = normalizedIncomingStatus;
  const normalizedDecision = reviewDecisionInput ? reviewDecisionInput.toLowerCase() : null;
  if (AGENTIC_RUN_ACTIVE_STATUSES.has(statusForPersistence)) {
    // queued/running remain unchanged
  } else if (errorMessage || statusForPersistence === AGENTIC_RUN_STATUS_FAILED) {
    statusForPersistence = AGENTIC_RUN_STATUS_FAILED;
  } else if (statusForPersistence === AGENTIC_RUN_STATUS_CANCELLED) {
    statusForPersistence = AGENTIC_RUN_STATUS_CANCELLED;
  } else if (normalizedDecision === 'approved') {
    statusForPersistence = AGENTIC_RUN_STATUS_APPROVED;
  } else if (normalizedDecision === 'rejected') {
    statusForPersistence = AGENTIC_RUN_STATUS_REJECTED;
  } else if (needsReview) {
    statusForPersistence = AGENTIC_RUN_STATUS_REVIEW;
  } else if (statusForPersistence === AGENTIC_RUN_STATUS_REVIEW) {
    statusForPersistence = AGENTIC_RUN_STATUS_REVIEW;
  } else if (AGENTIC_RUN_RESTARTABLE_STATUSES.has(statusForPersistence)) {
    // allow explicit overrides
  } else {
    statusForPersistence = AGENTIC_RUN_STATUS_APPROVED;
  }

  const eventName = statusForPersistence === AGENTIC_RUN_STATUS_FAILED ? 'AgenticResultFailed' : 'AgenticResultReceived';
  const nowIso = new Date().toISOString();

  const txn = ctx.db.transaction(
    (
      itemUUID: string,
      agenticPayload: any,
      status: string,
      now: string,
      errorText: string | null,
      needsHumanReview: boolean,
      summary: string | null,
      actor: string,
      review: { ReviewedBy: string | null; Decision: string | null; Notes: string | null }
    ) => {
      const existingItem = ctx.getItem.get(itemUUID);
      if (!existingItem) {
        throw new Error('Item not found');
      }

      const existingRun = ctx.getAgenticRun.get(itemUUID) as AgenticRun | undefined;
      const merged: Record<string, any> = { ...existingItem };
      if (agenticPayload && typeof agenticPayload === 'object') {
        for (const [key, value] of Object.entries(agenticPayload)) {
          if (value !== undefined) {
            merged[key] = value;
          }
        }
      }

      merged.ItemUUID = itemUUID;
      merged.UpdatedAt = now;

      const mergedDatum = toIsoString(merged.Datum_erfasst);
      const itemPayload: Item = {
        ...(merged as Item),
        UpdatedAt: new Date(now),
        Datum_erfasst: mergedDatum ? new Date(mergedDatum) : undefined,
        Veröffentlicht_Status: normalizePublishedStatus(merged.Veröffentlicht_Status) === 'yes'
      };

      ctx.persistItemWithinTransaction(itemPayload);

      const effectiveReviewState =
        status === AGENTIC_RUN_STATUS_REVIEW
          ? 'pending'
          : status === AGENTIC_RUN_STATUS_APPROVED
            ? 'approved'
            : status === AGENTIC_RUN_STATUS_REJECTED
              ? 'rejected'
              : 'not_required';
      const effectiveReviewedBy =
        effectiveReviewState === 'pending' ? null : review.ReviewedBy ?? existingRun?.ReviewedBy ?? null;
      const normalizedReviewDecision =
        typeof review.Decision === 'string' && review.Decision.trim()
          ? review.Decision.trim().toLowerCase()
          : existingRun?.LastReviewDecision ?? null;
      const normalizedReviewNotes =
        typeof review.Notes === 'string' && review.Notes.trim()
          ? review.Notes.trim()
          : existingRun?.LastReviewNotes ?? null;
      const searchQueryUpdate =
        typeof agenticPayload?.searchQuery === 'string' && agenticPayload.searchQuery.trim()
          ? agenticPayload.searchQuery.trim()
          : existingRun?.SearchQuery ?? null;
      searchQueryForLog = searchQueryUpdate;

      const runUpdate = {
        ItemUUID: itemUUID,
        SearchQuery: searchQueryUpdate,
        Status: status,
        LastModified: now,
        ReviewState: effectiveReviewState,
        ReviewedBy: effectiveReviewedBy,
        LastReviewDecision: normalizedReviewDecision,
        LastReviewNotes: normalizedReviewNotes
      };

      const updateResult = ctx.updateAgenticRunStatus.run(runUpdate);
      if (!updateResult?.changes) {
        logger.warn?.('Agentic run missing on status update, creating record', itemUUID);
        ctx.upsertAgenticRun.run(runUpdate);
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: itemUUID,
        Event: eventName,
        Meta: JSON.stringify({
          Status: status,
          ReviewState: effectiveReviewState,
          NeedsReview: needsHumanReview,
          Summary: summary,
          Error: errorText,
          ReviewNotes: normalizedReviewNotes,
          ReviewDecision: normalizedReviewDecision,
          LastModified: now
        })
      });
    }
  );

  try {
    txn(
      itemId,
      payload.item,
      statusForPersistence,
      nowIso,
      errorMessage,
      needsReview,
      summaryInput,
      agenticActor,
      {
        ReviewedBy: reviewedByInput,
        Decision: reviewDecisionInput,
        Notes: reviewNotesInput
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'Item not found') {
      logger.error?.('Agentic result item not found', itemId);
      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
        error: 'item-not-found',
        logger
      });
      throw new AgenticResultProcessingError('item-not-found', 404, { error: 'Item not found' }, requestContext);
    }

    logger.error?.('Agentic result transaction failed', err);
    recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
      error: message,
      searchQuery: searchQueryForLog,
      logger
    });
    throw new AgenticResultProcessingError(
      'agentic-result-persistence-failed',
      500,
      { error: 'Failed to process agentic result' },
      requestContext
    );
  }

  recordAgenticRequestLogUpdate(requestContext, statusForPersistence, {
    error: errorMessage,
    searchQuery: searchQueryForLog,
    logger
  });

  return {
    status: statusForPersistence,
    requestContext,
    searchQuery: searchQueryForLog,
    errorMessage
  };
}

export function createAgenticResultHandler(
  ctx: AgenticResultHandlerContext,
  logger?: AgenticResultLogger
): (payload: AgenticResultPayloadWithId) => AgenticResultHandlerSuccess {
  return (input) => handleAgenticResult(input, { ctx, logger });
}

export interface AgenticResultPayloadWithId extends AgenticResultHandlerInput {}
