/**
 * TODO(agentic-result-handler): consider extracting shared validation helpers
 * if additional result endpoints are introduced.
 * TODO(agentic-transcript-notes): Ensure terminal agentic runs record a transcript note summarizing the outcome for reviewers.
 * TODO(agentic-review-history): Evaluate retention window once downstream aggregation pipelines confirm read cadence.
 */
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  AGENTIC_RUN_RESTARTABLE_STATUSES,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_REVIEW,
  normalizeAgenticRunStatus,
  type AgenticResultPayload,
  type AgenticRun,
  type AgenticRequestContext,
  type AgenticRequestLog,
  type ItemRef
} from '../../models';
import {
  appendOutcomeTranscriptSection,
  normalizeAgenticStatusUpdate,
  recordAgenticRequestLogUpdate
} from '../agentic';
import { resolveAgenticRequestContext } from '../actions/agentic-request-context';

export type { AgenticResultPayload };

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
  getItemReference: { get: (artikelNummer: string) => ItemRef | undefined };
  getAgenticRun: { get: (artikelNummer: string) => AgenticRun | undefined };
  persistItemReference: (item: ItemRef) => void;
  updateAgenticRunStatus: { run: (update: Record<string, unknown>) => { changes?: number } };
  upsertAgenticRun: { run: (update: Record<string, unknown>) => unknown };
  insertAgenticRunReviewHistoryEntry?: { run: (entry: Record<string, unknown>) => unknown };
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
  artikelNummer: string;
  payload: AgenticResultPayload | Record<string, unknown> | null | undefined;
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

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'null') {
    return null;
  }
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return null;
}


// TODO(agentic-search-links): Revisit persisted source cap when retrieval telemetry confirms practical reviewer usage.
function normalizeSearchLinks(value: unknown): Array<{ url: string; title?: string; description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: Array<{ url: string; title?: string; description?: string }> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) {
      continue;
    }
    const dedupeKey = url.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : undefined;
    const description =
      typeof candidate.description === 'string' && candidate.description.trim() ? candidate.description.trim() : undefined;
    normalized.push({ url, title, description });
    if (normalized.length >= 25) {
      break;
    }
  }

  return normalized;
}

function serializeSearchLinksJson(value: unknown, logger?: AgenticResultLogger, artikelNummer?: string): string | null {
  const normalizedLinks = normalizeSearchLinks(value);
  if (normalizedLinks.length === 0) {
    return null;
  }

  try {
    return JSON.stringify(normalizedLinks);
  } catch (err) {
    logger?.warn?.('Agentic result failed to serialize search links', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    return null;
  }
}

function normalizeMissingSpec(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, trimmed);
    }
    if (deduped.size >= 10) {
      break;
    }
  }
  return Array.from(deduped.values());
}


function normalizeReviewMetadataForHistory(
  payload: Record<string, unknown>,
  logger?: AgenticResultLogger
): string | null {
  try {
    const reviewCandidate = payload.review;
    const reviewObject =
      typeof reviewCandidate === 'object' && reviewCandidate
        ? (reviewCandidate as Record<string, unknown>)
        : null;

    const resolved = {
      information_present: normalizeNullableBoolean(
        reviewObject?.information_present ?? payload.information_present ?? payload.informationPresent ?? null
      ),
      missing_spec: normalizeMissingSpec(reviewObject?.missing_spec ?? payload.missing_spec ?? payload.missingSpec ?? []),
      unneeded_spec: normalizeMissingSpec(reviewObject?.unneeded_spec ?? payload.unneeded_spec ?? payload.unneededSpec ?? []),
      bad_format: normalizeNullableBoolean(reviewObject?.bad_format ?? payload.bad_format ?? payload.badFormat ?? null),
      wrong_information: normalizeNullableBoolean(
        reviewObject?.wrong_information ?? payload.wrong_information ?? payload.wrongInformation ?? null
      ),
      wrong_physical_dimensions: normalizeNullableBoolean(
        reviewObject?.wrong_physical_dimensions ?? payload.wrong_physical_dimensions ?? payload.wrongPhysicalDimensions ?? null
      )
    };

    logger?.info?.('Agentic result normalized review signal summary', {
      signalPresenceCount: [
        resolved.information_present,
        resolved.bad_format,
        resolved.wrong_information,
        resolved.wrong_physical_dimensions
      ].filter((value) => value !== null).length,
      signalTrueCount: [resolved.bad_format, resolved.wrong_information, resolved.wrong_physical_dimensions].filter(Boolean)
        .length,
      missingSpecCount: resolved.missing_spec.length,
      unneededSpecCount: resolved.unneeded_spec.length
    });

    return JSON.stringify(resolved);
  } catch (err) {
    logger?.warn?.('Agentic result failed to normalize review metadata for history persistence', {
      error: err instanceof Error ? err.message : err
    });
    return null;
  }
}

function hasReviewMetadataPayload(payload: Record<string, unknown>): {
  hasMetadata: boolean;
  suppressedFields: string[];
} {
  const suppressedFields: string[] = [];

  if (typeof payload.reviewDecision === 'string' && payload.reviewDecision.trim()) {
    suppressedFields.push('ReviewDecision');
  }
  if (typeof payload.reviewNotes === 'string' && payload.reviewNotes.trim()) {
    suppressedFields.push('ReviewNotes');
  }

  const reviewCandidate = payload.review;
  const reviewObject =
    typeof reviewCandidate === 'object' && reviewCandidate ? (reviewCandidate as Record<string, unknown>) : null;
  if (reviewObject) {
    const checklistKeys = ['information_present', 'missing_spec', 'unneeded_spec', 'bad_format', 'wrong_information', 'wrong_physical_dimensions'];
    for (const key of checklistKeys) {
      if (Object.prototype.hasOwnProperty.call(reviewObject, key)) {
        suppressedFields.push(`ReviewChecklist.${key}`);
      }
    }
  }

  return {
    hasMetadata: suppressedFields.length > 0,
    suppressedFields
  };
}

function resolveReviewHistoryEligibility(
  payload: Record<string, unknown>,
  logger?: AgenticResultLogger
): { shouldInsertHistory: boolean; source: string } {
  // TODO(agentic-review-history-source): Replace action-key detection with a dedicated request context source marker once callbacks include one.
  try {
    const actionCandidates: Array<unknown> = [
      payload.action,
      payload.reviewAction,
      payload.review_action,
      (payload.meta as Record<string, unknown> | undefined)?.action,
      (payload.metadata as Record<string, unknown> | undefined)?.action,
      (payload.review as Record<string, unknown> | undefined)?.action
    ];

    for (const candidate of actionCandidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = candidate.trim().toLowerCase();
      if (normalized === 'review' || normalized === 'close') {
        return { shouldInsertHistory: true, source: normalized };
      }
    }

    return {
      shouldInsertHistory: false,
      source: typeof payload.actor === 'string' && payload.actor.trim() ? payload.actor.trim() : 'unknown'
    };
  } catch (err) {
    logger?.warn?.('Agentic result failed to resolve review history source; skipping history insert', {
      error: err instanceof Error ? err.message : err
    });
    return { shouldInsertHistory: false, source: 'ambiguous' };
  }
}

function resolvePayloadArtikelNummer(payload: Record<string, unknown>): string | null {
  const itemPayload = payload.item;
  const candidates: Array<unknown> = [
    payload.artikelNummer,
    payload.Artikel_Nummer,
    payload.Artikelnummer,
    typeof itemPayload === 'object' && itemPayload ? (itemPayload as Record<string, unknown>).Artikel_Nummer : null,
    typeof itemPayload === 'object' && itemPayload ? (itemPayload as Record<string, unknown>).artikelNummer : null,
    typeof itemPayload === 'object' && itemPayload ? (itemPayload as Record<string, unknown>).Artikelnummer : null
  ];

  for (const candidate of candidates) {
    const resolved = toTrimmedString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function collectLegacyIdentifierKeys(payload: Record<string, unknown>): string[] {
  const itemPayload = payload.item;
  const keys = new Set<string>();
  const legacyKeys = ['itemId', 'itemID', 'itemUUid', 'itemUuid', 'itemUUID'];

  for (const legacyKey of legacyKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, legacyKey)) {
      keys.add(legacyKey);
    }
    if (typeof itemPayload === 'object' && itemPayload && Object.prototype.hasOwnProperty.call(itemPayload, legacyKey)) {
      keys.add(`item.${legacyKey}`);
    }
  }

  return Array.from(keys);
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
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (!payload || typeof payload !== 'object') {
    logger.warn?.('Agentic result missing payload object');
    throw new AgenticResultProcessingError('payload-required', 400, { error: 'Payload is required' }, null);
  }

  const inputArtikelNummer = input.artikelNummer?.trim() ?? '';
  const payloadArtikelNummer = resolvePayloadArtikelNummer(payload);
  const legacyIdentifierKeys = collectLegacyIdentifierKeys(payload);
  if (legacyIdentifierKeys.length) {
    // TODO(agentic-result-legacy): Remove legacy identifier warnings once upstream clients migrate fully.
    logger.warn?.('Agentic result payload includes legacy item id fields', {
      artikelNummer: payloadArtikelNummer ?? inputArtikelNummer ?? null,
      legacyIdentifierKeys
    });
  }
  const artikelNummer = payloadArtikelNummer ?? '';
  if (!artikelNummer) {
    logger.error?.('Agentic result missing Artikel_Nummer in payload', { legacyIdentifierKeys });
    throw new AgenticResultProcessingError(
      'invalid-artikel-nummer',
      400,
      { error: 'Artikel_Nummer is required in payload' },
      null
    );
  }
  if (inputArtikelNummer && payloadArtikelNummer && inputArtikelNummer !== payloadArtikelNummer) {
    logger.warn?.('Agentic result Artikel_Nummer mismatch', {
      artikelNummer: inputArtikelNummer,
      payloadArtikelNummer
    });
    throw new AgenticResultProcessingError(
      'artikel-nummer-mismatch',
      400,
      { error: 'Artikel_Nummer mismatch' },
      null
    );
  }

  const requestContext = resolveAgenticRequestContext(payload, artikelNummer);
  const requestId = requestContext?.id?.trim() ?? '';

  if (!requestId) {
    logger.warn?.('Agentic result rejected due to missing request id', { artikelNummer });
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
    logger.warn?.('Agentic result rejected due to unknown request id', { artikelNummer, requestId });
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

  const initialSearch = resolveInitialSearch(payload, requestLog);
  recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_RUNNING, {
    markRunning: true,
    searchQuery: initialSearch,
    logger
  });

  const statusInput = typeof payload.status === 'string' ? payload.status : '';
  const normalizedIncomingStatus = normalizeAgenticRunStatus(statusInput);
  const errorMessage = typeof payload.error === 'string' ? payload.error.trim() || null : null;
  let needsReview = Boolean(payload.needsReview);
  const summaryInput = typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : null;
  const reviewDecisionInputRaw =
    typeof payload.reviewDecision === 'string' && payload.reviewDecision.trim()
      ? payload.reviewDecision.trim()
      : null;
  let normalizedDecision = reviewDecisionInputRaw ? reviewDecisionInputRaw.toLowerCase() : null;
  const reviewNotesInput =
    typeof payload.reviewNotes === 'string' && payload.reviewNotes.trim() ? payload.reviewNotes.trim() : null;
  const reviewedByInput = typeof payload.reviewedBy === 'string' && payload.reviewedBy.trim() ? payload.reviewedBy.trim() : null;
  const agenticActor = typeof payload.actor === 'string' && payload.actor ? payload.actor : 'agentic-service';
  const reviewMetadataJson = normalizeReviewMetadataForHistory(payload, logger);
  const reviewMetadataPresence = hasReviewMetadataPayload(payload);
  const reviewHistoryEligibility = resolveReviewHistoryEligibility(payload, logger);

  let statusForPersistence = normalizedIncomingStatus;
  let reviewDecisionForPersistence = reviewDecisionInputRaw;
  const normalizedReviewer = reviewedByInput ? reviewedByInput.toLowerCase() : null;

  // TODO: Replace reviewer heuristics with explicit reviewer role metadata once available.
  const supervisorAttemptedApproval =
    normalizedDecision === 'approved' && (!normalizedReviewer || normalizedReviewer.includes('supervisor'));
  if (supervisorAttemptedApproval) {
    logger.info?.('Supervisor approval requires manual user confirmation', {
      artikelNummer,
      reviewedBy: reviewedByInput ?? null
    });
    normalizedDecision = null;
    reviewDecisionForPersistence = null;
    needsReview = true;
    statusForPersistence = AGENTIC_RUN_STATUS_REVIEW;
  }

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
      artikelNummerInput: string,
      agenticPayload: any,
      status: string,
      now: string,
      errorText: string | null,
      needsHumanReview: boolean,
      summary: string | null,
      actor: string,
      review: { ReviewedBy: string | null; Decision: string | null; Notes: string | null }
    ) => {
      let existingReference: ItemRef | null = null;
      try {
        existingReference = ctx.getItemReference.get(artikelNummerInput) ?? null;
      } catch (err) {
        logger.error?.('Agentic result failed to load item reference', {
          artikelNummer: artikelNummerInput,
          error: err instanceof Error ? err.message : err
        });
        throw err instanceof Error ? err : new Error(String(err));
      }
      if (!existingReference) {
        throw new Error('Item reference not found');
      }

      let existingRun: AgenticRun | undefined;
      try {
        existingRun = ctx.getAgenticRun.get(artikelNummerInput) as AgenticRun | undefined;
      } catch (err) {
        logger.error?.('Agentic result failed to load agentic run', {
          artikelNummer: artikelNummerInput,
          error: err instanceof Error ? err.message : err
        });
        throw err instanceof Error ? err : new Error(String(err));
      }
      const shouldPersistItemUpdate = status !== AGENTIC_RUN_STATUS_REJECTED;
      if (shouldPersistItemUpdate) {
        const merged: Record<string, any> = { ...existingReference };
        let mappedLegacyPrice = false;
        if (agenticPayload && typeof agenticPayload === 'object') {
          for (const [key, value] of Object.entries(agenticPayload)) {
            if (value !== undefined) {
              if (key === 'Marktpreis') {
                if (merged.Verkaufspreis === undefined) {
                  merged.Verkaufspreis = value;
                  mappedLegacyPrice = true;
                }
                continue;
              }
              merged[key] = value;
            }
          }
        }

        merged.Artikel_Nummer = artikelNummerInput;
        merged.Veröffentlicht_Status = normalizePublishedStatus(merged.Veröffentlicht_Status);
        if (mappedLegacyPrice) {
          logger?.info?.({ msg: 'mapped legacy Marktpreis to Verkaufspreis', artikelNummer: artikelNummerInput });
        }

        ctx.persistItemReference(merged as ItemRef);
      } else {
        logger?.info?.({
          msg: 'skipping item update for non-approved agentic run',
          artikelNummer: artikelNummerInput,
          reviewDecision: review.Decision ?? null,
          status
        });
      }

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
      const lastSearchLinksJson = serializeSearchLinksJson(agenticPayload?.sources, logger, artikelNummerInput);
      searchQueryForLog = searchQueryUpdate;

      if (!artikelNummerInput) {
        logger.warn?.('Agentic result skipped run update without Artikel_Nummer', {
          artikelNummer: artikelNummerInput,
          status
        });
      } else {
        const runUpdate = {
          Artikel_Nummer: artikelNummerInput,
          SearchQuery: searchQueryUpdate,
          LastSearchLinksJson: lastSearchLinksJson,
          LastSearchLinksJsonIsSet: true,
          Status: status,
          LastModified: now,
          ReviewState: effectiveReviewState,
          ReviewedBy: effectiveReviewedBy,
          ReviewedByIsSet: true,
          LastReviewDecision: normalizedReviewDecision,
          LastReviewDecisionIsSet: true,
          LastReviewNotes: normalizedReviewNotes,
          LastReviewNotesIsSet: true,
          RetryCount: existingRun?.RetryCount ?? 0,
          RetryCountIsSet: true,
          NextRetryAt: existingRun?.NextRetryAt ?? null,
          NextRetryAtIsSet: true,
          LastError: existingRun?.LastError ?? null,
          LastErrorIsSet: true,
          LastAttemptAt: existingRun?.LastAttemptAt ?? null,
          LastAttemptAtIsSet: true
        };

        // TODO(agentic-flag-normalization): Centralize SQLite-safe status payload coercion once
        // the updateAgenticRunStatus statement accepts native booleans.
        const normalizedRunUpdate = normalizeAgenticStatusUpdate(runUpdate);

        const updateResult = ctx.updateAgenticRunStatus.run(normalizedRunUpdate);
        if (!updateResult?.changes) {
          logger.warn?.('Agentic run missing on status update, creating record', artikelNummerInput);
          ctx.upsertAgenticRun.run(normalizedRunUpdate);
        }

        if (ctx.insertAgenticRunReviewHistoryEntry?.run && reviewHistoryEligibility.shouldInsertHistory) {
          try {
            ctx.insertAgenticRunReviewHistoryEntry.run({
              Artikel_Nummer: artikelNummerInput,
              Status: status,
              ReviewState: effectiveReviewState,
              ReviewDecision: normalizedReviewDecision,
              ReviewNotes: normalizedReviewNotes,
              ReviewMetadata: reviewMetadataJson,
              ReviewedBy: effectiveReviewedBy,
              RecordedAt: now
            });
          } catch (err) {
            logger.warn?.('Agentic result failed to persist review history entry', {
              artikelNummer: artikelNummerInput,
              status,
              reviewState: effectiveReviewState,
              error: err instanceof Error ? err.message : err
            });
          }
        } else if (reviewMetadataPresence.hasMetadata) {
          logger.info?.('Agentic result suppressed review history metadata from non-human source', {
            artikelNummer: artikelNummerInput,
            source: reviewHistoryEligibility.source,
            suppressedFields: reviewMetadataPresence.suppressedFields
          });
        }
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummerInput,
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
      artikelNummer,
      payload.item,
      statusForPersistence,
      nowIso,
      errorMessage,
      needsReview,
      summaryInput,
      agenticActor,
      {
        ReviewedBy: reviewedByInput,
        Decision: reviewDecisionForPersistence,
        Notes: reviewNotesInput
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'Item not found') {
      logger.error?.('Agentic result item not found', artikelNummer);
      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
        error: 'item-not-found',
        logger
      });
      throw new AgenticResultProcessingError('item-not-found', 404, { error: 'Item not found' }, requestContext);
    }
    if (message === 'Item reference not found') {
      logger.error?.('Agentic result item reference not found', artikelNummer);
      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
        error: 'item-reference-not-found',
        logger
      });
      throw new AgenticResultProcessingError(
        'item-reference-not-found',
        404,
        { error: 'Item reference not found' },
        requestContext
      );
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

  // TODO(agentic-transcript-log-snippets): Centralize transcript payload formatting so request log snapshots remain consistent
  // across agentic entry points.
  const transcriptResponse =
    summaryInput ||
    errorMessage ||
    `Agentic status updated to ${statusForPersistence}${needsReview ? ' (needs review)' : ''}.`;
  const transcriptRequest = {
    status: statusForPersistence,
    needsReview,
    summary: summaryInput,
    error: errorMessage,
    reviewDecision: normalizedDecision ?? null,
    reviewNotes: reviewNotesInput,
    reviewedBy: reviewedByInput,
    requestId,
    requestLogSnapshot: requestLog
      ? {
          id: requestLog.UUID,
          status: requestLog.Status ?? null,
          search: requestLog.Search ?? null,
          error: requestLog.Error ?? null,
          notifiedAt: requestLog.NotifiedAt ?? null,
          lastNotificationError: requestLog.LastNotificationError ?? null,
          updatedAt: requestLog.UpdatedAt ?? requestLog.CreatedAt ?? null
        }
      : null
  };

  void appendOutcomeTranscriptSection(
    artikelNummer,
    'Agentic run outcome',
    transcriptRequest,
    transcriptResponse,
    logger
  ).catch((err) => {
    logger?.warn?.({
      err,
      msg: 'failed to append agentic outcome transcript section',
      artikelNummer,
      status: statusForPersistence
    });
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
): (payload: AgenticResultPayload) => AgenticResultHandlerSuccess {
  return (payload) => {
    const payloadArtikelNummer = resolvePayloadArtikelNummer(payload as Record<string, unknown>) ?? '';
    return handleAgenticResult({ artikelNummer: payloadArtikelNummer, payload }, { ctx, logger });
  };
}
