import type Database from 'better-sqlite3';
import {
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_TERMINAL_STATUSES,
  type AgenticRun,
  type AgenticRunCancelInput,
  type AgenticRunCancelResult,
  type AgenticRunDeleteInput,
  type AgenticRunDeleteResult,
  type AgenticRunRestartInput,
  type AgenticRunReviewMetadata,
  type AgenticRunStartInput,
  type AgenticRunStartResult,
  type AgenticRunStatusResult,
  type AgenticHealthStatus,
  type AgenticModelInvocationInput,
  type AgenticModelInvocationResult,
  type AgenticRequestContext,
  type AgenticHealthOptions,
  type AgenticRunReviewHistoryEntry,
  normalizeAgenticRunStatus
} from '../../models';
// TODO(agentic-run-delete): Confirm deletion flows preserve observability requirements as APIs evolve.
import { appendTranscriptSection, createTranscriptWriter } from './flow/transcript';
import {
  logAgenticRequestStart,
  logAgenticRequestEnd,
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure,
  fetchQueuedAgenticRuns,
  updateQueuedAgenticRunQueueState,
  listAgenticRunReviewHistory,
  type AgenticRunQueueUpdate,
  type LogEventPayload
} from '../db';
import { locateTranscript } from './flow/transcript';

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
  getItemReference: Database.Statement;
  upsertAgenticRun: Database.Statement;
  updateAgenticRunStatus: Database.Statement;
  updateQueuedAgenticRunQueueState?: (update: AgenticRunQueueUpdate) => void;
  logEvent: (payload: LogEventPayload) => void;
  updateAgenticReview?: Database.Statement;
  findByMaterial?: { all?: (artikelNummer: string) => Array<{ ItemUUID?: string | null }> };
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
  SELECT Id, Artikel_Nummer, SearchQuery, Status, LastModified, ReviewState, ReviewedBy,
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
      artikelNummer: update.Artikel_Nummer,
      error: toErrorMessage(err)
    });
  }
}

// TODO(agentic-id-resolution): Confirm upstream callers always send Artikel_Nummer for agentic runs.
// TODO(agentic-run-fk-preflight): Revisit the reference preflight once agentic runs can target instance rows.
function resolveAgenticArtikelNummer(
  itemId: string,
  logger: AgenticServiceLogger
): { artikelNummer: string | null; reason: string | null; sourceItemId: string } {
  const trimmed = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmed) {
    logger.warn?.('[agentic-service] Missing Artikel_Nummer for agentic run key resolution');
    return { artikelNummer: null, reason: 'missing-item-id', sourceItemId: '' };
  }

  if (trimmed.startsWith('I-')) {
    logger.warn?.('[agentic-service] Agentic run expects Artikel_Nummer, received ItemUUID', { itemId: trimmed });
    return { artikelNummer: null, reason: 'invalid-item-id', sourceItemId: trimmed };
  }

  return { artikelNummer: trimmed, reason: null, sourceItemId: trimmed };
}

function hasAgenticReference(
  artikelNummer: string,
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger,
  context: string | null,
  source: string
): boolean {
  try {
    const referenceRow = deps.getItemReference.get(artikelNummer) as { Artikel_Nummer?: string } | undefined;
    if (!referenceRow) {
      logger.warn?.('[agentic-service] Missing item reference for agentic run', {
        artikelNummer,
        context,
        source
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error?.('[agentic-service] Failed to verify item reference for agentic run', {
      artikelNummer,
      context,
      source,
      error: toErrorMessage(err)
    });
    throw err;
  }
}

// TODO(agentic-review-state): Align review state semantics with upstream contract once schema is formalized.
// TODO(agentic-review-caps): Keep missing_spec limits aligned with any future upstream reviewer payload policy.
const REVIEW_MISSING_SPEC_MAX_COUNT = 8;
const REVIEW_MISSING_SPEC_MAX_TOKENS_PER_ENTRY = 12;

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
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
  if (!normalized) {
    return null;
  }
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  if (normalized === 'null') {
    return null;
  }
  return null;
}

function normalizeMissingSpec(rawMissingSpec: unknown): string[] {
  if (!Array.isArray(rawMissingSpec) || rawMissingSpec.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const rawEntry of rawMissingSpec) {
    if (typeof rawEntry !== 'string') {
      continue;
    }

    const trimmed = rawEntry.trim();
    if (!trimmed) {
      continue;
    }

    const tokens = trimmed.split(/\s+/).slice(0, REVIEW_MISSING_SPEC_MAX_TOKENS_PER_ENTRY);
    const cappedEntry = tokens.join(' ').trim();
    if (!cappedEntry) {
      continue;
    }

    const dedupeKey = cappedEntry.toLowerCase();
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, cappedEntry);
    }

    if (deduped.size >= REVIEW_MISSING_SPEC_MAX_COUNT) {
      break;
    }
  }

  return Array.from(deduped.values());
}

function normalizeReviewMetadata(
  review: AgenticRunReviewMetadata | null | undefined,
  fallback: AgenticRun | null,
  logger: AgenticServiceLogger
): NormalizedReviewMetadata | null {
  if (!review && !fallback) {
    return null;
  }

  try {
    const rawState =
      review && typeof (review as { state?: unknown }).state === 'string'
        ? ((review as { state?: string | null }).state ?? '').trim()
        : null;

    const base = review ?? {
      decision: fallback?.LastReviewDecision ?? null,
      information_present: null,
      missing_spec: [],
      bad_format: null,
      wrong_information: null,
      wrong_physical_dimensions: null,
      notes: fallback?.LastReviewNotes ?? null,
      reviewedBy: fallback?.ReviewedBy ?? null
    };

    const decision = base.decision && base.decision.trim() ? base.decision.trim().toLowerCase() : null;
    const notes = base.notes && base.notes.trim() ? base.notes.trim() : null;
    const reviewedBy = base.reviewedBy && base.reviewedBy.trim() ? base.reviewedBy.trim() : null;
    const fallbackState = fallback?.ReviewState && fallback.ReviewState.trim() ? fallback.ReviewState.trim() : null;
    const state = rawState || fallbackState || null;
    const information_present = normalizeNullableBoolean(base.information_present);
    const bad_format = normalizeNullableBoolean(base.bad_format);
    const wrong_information = normalizeNullableBoolean(base.wrong_information);
    const wrong_physical_dimensions = normalizeNullableBoolean(base.wrong_physical_dimensions);
    const missing_spec = normalizeMissingSpec(base.missing_spec);

    logger.info?.('[agentic-service] Normalized review metadata', {
      provided: Boolean(review),
      normalizedDecisionPresent: Boolean(decision),
      normalizedNotesPresent: Boolean(notes),
      normalizedReviewedByPresent: Boolean(reviewedBy),
      normalizedStatePresent: Boolean(state),
      fallbackStatePresent: Boolean(fallbackState),
      normalizedSignals: {
        information_present,
        bad_format,
        wrong_information,
        wrong_physical_dimensions,
        missing_spec_count: missing_spec.length
      },
      signalPresenceCount: [information_present, bad_format, wrong_information, wrong_physical_dimensions].filter(
        (value) => value !== null
      ).length,
      signalTrueCount: [bad_format, wrong_information, wrong_physical_dimensions].filter(Boolean).length
    });

    return {
      decision,
      information_present,
      missing_spec,
      bad_format,
      wrong_information,
      wrong_physical_dimensions,
      notes,
      reviewedBy,
      state
    };
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to normalize review metadata', {
      provided: Boolean(review),
      fallbackProvided: Boolean(fallback),
      reviewShape: review && typeof review === 'object' ? Object.keys(review).sort() : null,
      fallbackReviewStatePresent: Boolean(fallback?.ReviewState),
      error: toErrorMessage(err)
    });

    return {
      decision: null,
      information_present: null,
      missing_spec: [],
      bad_format: null,
      wrong_information: null,
      wrong_physical_dimensions: null,
      notes: null,
      reviewedBy: null,
      state: fallback?.ReviewState?.trim() || null
    };
  }
}

// TODO(agentic-transcript-shared): Consider moving transcript attachment to a shared helper module.
export function attachTranscriptReference(
  agenticRun: AgenticRun | null,
  itemId: string,
  logger: AgenticServiceLogger
): AgenticRun | null {
  // TODO(agentic-transcript-coverage): Capture transcript metadata for every terminal run state without relying on upstream
  // flow writers.
  if (!agenticRun) {
    return null;
  }

  try {
    const transcript = locateTranscript(itemId, logger);
    return { ...agenticRun, TranscriptUrl: transcript?.publicUrl ?? null };
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to attach transcript reference', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
    return { ...agenticRun, TranscriptUrl: null };
  }
}

export async function appendOutcomeTranscriptSection(
  itemId: string,
  heading: string,
  request: Record<string, unknown>,
  response: string,
  logger: AgenticServiceLogger
): Promise<string | null> {
  try {
    const writer = await createTranscriptWriter(itemId, logger);
    if (!writer) {
      return null;
    }

    const transcriptPayload = { request, response };

    await appendTranscriptSection(writer, heading, transcriptPayload, response, logger, itemId);
    return writer.publicUrl ?? null;
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to append outcome transcript section', {
      itemId,
      heading,
      error: err instanceof Error ? err.message : err
    });
    return null;
  }
}

function fetchAgenticRun(
  itemId: string,
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): AgenticRun | null {
  try {
    const result = deps.getAgenticRun.get(itemId) as AgenticRun | undefined;
    return attachTranscriptReference(result ?? null, itemId, logger);
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
    artikelNummer: string;
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
      Artikel_Nummer: payload.artikelNummer,
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
      artikelNummer: payload.artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    throw err;
  }

  try {
    deps.logEvent({
      Actor: payload.actor,
      EntityType: 'Item',
      EntityId: payload.artikelNummer,
      Event: payload.created ? 'AgenticRunQueued' : 'AgenticRunRequeued',
      Meta: JSON.stringify({
        searchQuery: payload.searchQuery,
        context: payload.context
      })
    });
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to persist agentic queue event', {
      artikelNummer: payload.artikelNummer,
      error: err instanceof Error ? err.message : err
    });
  }

  return fetchAgenticRun(payload.artikelNummer, deps, logger);
}

// TODO(agent): Verify requestId forwarding into background invocations when telemetry hooks evolve.
// TODO(agentic-retries): Centralize retry bookkeeping/backoff settings once queue orchestration solidifies.
interface BackgroundInvocationPayload {
  artikelNummer: string;
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
    // TODO(agentic-scheduler): Record missing invoker metadata so stalled runs surface in ops dashboards.
    const nowIso = resolveNow(deps).toISOString();
    let existingRun: AgenticRun | null = null;

    try {
      existingRun = fetchAgenticRun(payload.artikelNummer, deps, logger);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to load existing run after missing invoker', {
        artikelNummer: payload.artikelNummer,
        context: payload.context,
        error: toErrorMessage(err)
      });
    }
    logger.warn?.('[agentic-service] Agentic model invocation unavailable; run will remain queued', {
      artikelNummer: payload.artikelNummer,
      context: payload.context
    });

    const updateQueueState = deps.updateQueuedAgenticRunQueueState ?? updateQueuedAgenticRunQueueState;
    if (!updateQueueState) {
      return;
    }

    try {
      updateQueueState({
        Artikel_Nummer: payload.artikelNummer,
        Status: AGENTIC_RUN_STATUS_QUEUED,
        LastModified: nowIso,
        RetryCount: existingRun?.RetryCount ?? 0,
        NextRetryAt: existingRun?.NextRetryAt ?? null,
        LastError: 'Agentic model invocation unavailable',
        LastAttemptAt: nowIso
      });
    } catch (err) {
      logger.error?.('[agentic-service] Failed to update queued run after missing invoker', {
        artikelNummer: payload.artikelNummer,
        context: payload.context,
        error: toErrorMessage(err)
      });
    }
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
      existingRun = fetchAgenticRun(payload.artikelNummer, deps, logger);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to load existing run before invocation', {
        artikelNummer: payload.artikelNummer,
        context: payload.context,
        error: toErrorMessage(err)
      });
    }

    const nextRetryCount = (existingRun?.RetryCount ?? 0) + 1;
    const attemptTimestamp = nowIso;

    applyQueueUpdate(deps, logger, {
      Artikel_Nummer: payload.artikelNummer,
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
          Artikel_Nummer: payload.artikelNummer,
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
          artikelNummer: payload.artikelNummer
        });
      } else {
        logger.info?.('[agentic-service] Agentic run marked running prior to invocation', {
          artikelNummer: payload.artikelNummer,
          context: payload.context
        });
      }
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      logger.error?.('[agentic-service] Failed to mark agentic run running prior to invocation', {
        artikelNummer: payload.artikelNummer,
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
          existingRun = fetchAgenticRun(payload.artikelNummer, deps, logger);
        } catch (loadErr) {
          logger.error?.('[agentic-service] Failed to load run during auto-cancel', {
            artikelNummer: payload.artikelNummer,
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
          Artikel_Nummer: payload.artikelNummer,
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
              Artikel_Nummer: payload.artikelNummer,
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
              artikelNummer: payload.artikelNummer,
              reason
            });
          } else {
            logger.info?.('[agentic-service] Agentic run auto-cancelled after failure', {
              artikelNummer: payload.artikelNummer,
              reason
            });
          }
        } catch (updateErr) {
          logger.error?.('[agentic-service] Failed to auto-cancel agentic run after failure', {
            artikelNummer: payload.artikelNummer,
            reason,
            error: toErrorMessage(updateErr)
          });
        }

        try {
          deps.logEvent({
            Actor: 'agentic-service',
            EntityType: 'Item',
            EntityId: payload.artikelNummer,
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
            artikelNummer: payload.artikelNummer,
            reason,
            error: toErrorMessage(eventErr)
          });
        }
      } catch (err) {
        logger.error?.('[agentic-service] Auto-cancel workflow threw after failure', {
          artikelNummer: payload.artikelNummer,
          reason,
          error: toErrorMessage(err)
        });
      }
    };

    try {
      const result = await invokeModel({
        itemId: payload.artikelNummer,
        searchQuery: payload.searchQuery,
        context: payload.context,
        review: payload.review,
        requestId: payload.request?.id ?? null
      });
      if (!result?.ok) {
        const failureMessage = typeof result?.message === 'string' ? result.message : null;
        logger.error?.('[agentic-service] Model invocation returned failure result', {
          artikelNummer: payload.artikelNummer,
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
        artikelNummer: payload.artikelNummer,
        context: payload.context
      });
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      logger.error?.('[agentic-service] Model invocation failed during asynchronous dispatch', {
        artikelNummer: payload.artikelNummer,
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
      artikelNummer: payload.artikelNummer,
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

// TODO(agentic-queue-dispatch): Add queue-level metrics once dispatch cadence is in production.
export function dispatchQueuedAgenticRuns(
  deps: AgenticServiceDependencies,
  { limit }: { limit?: number } = {}
): { scheduled: number; skipped: number; failed: number } {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const effectiveLimit = Number.isFinite(limit) && (limit ?? 0) > 0 ? Math.floor(limit as number) : 5;
  let queuedRuns: AgenticRun[] = [];

  try {
    queuedRuns = fetchQueuedAgenticRuns(effectiveLimit);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to load queued agentic runs for dispatch', {
      error: toErrorMessage(err),
      limit: effectiveLimit
    });
    return { scheduled: 0, skipped: 0, failed: 0 };
  }

  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const run of queuedRuns) {
    const artikelNummer = (run.Artikel_Nummer || '').trim();
    const searchQuery = (run.SearchQuery || '').trim();

    if (!artikelNummer) {
      skipped += 1;
      logger.warn?.('[agentic-service] Skipping queued agentic run without Artikel_Nummer', {
        runId: run.Id
      });
      continue;
    }

    if (!searchQuery) {
      skipped += 1;
      const nowIso = resolveNow(deps).toISOString();
      const retryCount = run.RetryCount ?? 0;
      const lastAttemptAt = run.LastAttemptAt ?? nowIso;
      const lastError = 'missing-search-query';

      logger.warn?.('[agentic-service] Skipping queued agentic run with empty search query', {
        artikelNummer,
        runId: run.Id
      });

      applyQueueUpdate(deps, logger, {
        Artikel_Nummer: artikelNummer,
        Status: AGENTIC_RUN_STATUS_FAILED,
        LastModified: nowIso,
        RetryCount: retryCount,
        NextRetryAt: null,
        LastError: lastError,
        LastAttemptAt: lastAttemptAt
      });
      continue;
    }

    try {
      scheduleAgenticModelInvocation({
        artikelNummer,
        searchQuery,
        context: null,
        review: null,
        request: null,
        deps,
        logger
      });
      scheduled += 1;
    } catch (err) {
      failed += 1;
      const errorMessage = toErrorMessage(err);
      logger.error?.('[agentic-service] Failed to schedule queued agentic run', {
        artikelNummer,
        runId: run.Id,
        error: errorMessage
      });

      const nowIso = resolveNow(deps).toISOString();
      const retryCount = run.RetryCount ?? 0;
      const lastAttemptAt = run.LastAttemptAt ?? nowIso;

      applyQueueUpdate(deps, logger, {
        Artikel_Nummer: artikelNummer,
        Status: AGENTIC_RUN_STATUS_FAILED,
        LastModified: nowIso,
        RetryCount: retryCount,
        NextRetryAt: null,
        LastError: errorMessage,
        LastAttemptAt: lastAttemptAt
      });
    }
  }

  return { scheduled, skipped, failed };
}

function validateDependencies(deps: AgenticServiceDependencies): void {
  if (
    !deps?.db ||
    !deps.getAgenticRun ||
    !deps.getItemReference ||
    !deps.upsertAgenticRun ||
    !deps.updateAgenticRunStatus ||
    !deps.logEvent
  ) {
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

  const resolved = resolveAgenticArtikelNummer(itemId, logger);
  if (!resolved.artikelNummer) {
    const reason = resolved.reason ?? 'missing-artikel-nummer';
    logger.warn?.('[agentic-service] startAgenticRun failed to resolve Artikel_Nummer', {
      itemId,
      reason,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, reason, logger);
    return { agentic: null, queued: false, created: false, reason };
  }
  const artikelNummer = resolved.artikelNummer;
  logger.info?.('[agentic-service] Resolved Artikel_Nummer for agentic run start', {
    itemId: resolved.sourceItemId,
    artikelNummer,
    context: input.context ?? null
  });

  const existing = fetchAgenticRun(artikelNummer, deps, logger);
  if (existing) {
    logger.info?.('[agentic-service] Skipping agentic run creation because canonical run already exists', {
      artikelNummer,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'already-exists', logger);
    return { agentic: existing, queued: false, created: false, reason: 'already-exists' };
  }

  const searchQuery = (input.searchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] startAgenticRun missing search query', {
      artikelNummer,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-search-query' };
  }

  if (!hasAgenticReference(artikelNummer, deps, logger, input.context ?? null, 'startAgenticRun')) {
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-reference', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-reference' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, null, logger);
  try {
    recordRequestLogStart(request, searchQuery, logger);
    const agentic = persistQueuedRun(
      {
        artikelNummer,
        searchQuery,
        actor: input.actor?.trim() || null,
        context: input.context?.trim() || null,
        review,
        created: true
      },
      deps,
      logger
    );

    recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
      searchQuery,
      logger
    });

    scheduleAgenticModelInvocation({
      artikelNummer,
      searchQuery,
      context: input.context?.trim() || null,
      review,
      request,
      deps,
      logger
    });

    logger.info?.('[agentic-service] Agentic run queued for asynchronous execution', {
      artikelNummer,
      context: input.context ?? null
    });
    return { agentic, queued: true, created: true };
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
  const resolved = resolveAgenticArtikelNummer(itemId, logger);
  if (!resolved.artikelNummer) {
    const reason = resolved.reason ?? 'missing-artikel-nummer';
    logger.warn?.('[agentic-service] cancelAgenticRun failed to resolve Artikel_Nummer', { itemId, reason });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, reason, logger);
    return { cancelled: false, agentic: null, reason };
  }
  const artikelNummer = resolved.artikelNummer;

  const actor = (input.actor || '').trim();
  const cancellationReason = input.reason && input.reason.trim()
    ? input.reason.trim()
    : actor
      ? `Cancelled by ${actor}`
      : 'Agentic run cancelled';

  const existing = fetchAgenticRun(artikelNummer, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] cancelAgenticRun attempted without existing run', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-found', logger);
    return { cancelled: false, agentic: null, reason: 'not-found' };
  }

  const nowIso = resolveNow(deps).toISOString();
  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);
  const txn = deps.db.transaction((actorName: string) => {
    const retryCount = existing.RetryCount ?? 0;
    const lastAttemptAt = existing.LastAttemptAt ?? nowIso;
    const lastError = (cancellationReason || existing.LastError) ?? null;

    applyQueueUpdate(deps, logger, {
      Artikel_Nummer: artikelNummer,
      Status: AGENTIC_RUN_STATUS_CANCELLED,
      LastModified: nowIso,
      RetryCount: retryCount,
      NextRetryAt: null,
      LastError: lastError,
      LastAttemptAt: lastAttemptAt
    });

    const updateResult = deps.updateAgenticRunStatus.run(
      normalizeAgenticStatusUpdate({
        Artikel_Nummer: artikelNummer,
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

    try {
      deps.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: 'AgenticRunCancelled',
        Meta: JSON.stringify({
          previousStatus: existing.Status ?? null,
          cancelledAt: nowIso,
          reason: cancellationReason ?? null
        })
      });
    } catch (err) {
      logger.error?.('[agentic-service] Failed to record agentic cancel event', {
        artikelNummer,
        error: toErrorMessage(err)
      });
      throw err;
    }
  });

  try {
    txn(actor);
    finalizeRequestLog(request, REQUEST_STATUS_CANCELLED, null, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to cancel agentic run', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  try {
    await appendOutcomeTranscriptSection(
      artikelNummer,
      'Agentic run cancelled',
      {
        status: existing.Status ?? null,
        actor,
        reason: cancellationReason
      },
      cancellationReason,
      logger
    );
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to record cancellation transcript note', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
  }

  const refreshed = fetchAgenticRun(artikelNummer, deps, logger);
  return { cancelled: true, agentic: refreshed };
}

export async function deleteAgenticRun(
  input: AgenticRunDeleteInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunDeleteResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(input.request ?? null);
  persistRequestPayloadSnapshot(request, logger);

  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] deleteAgenticRun missing itemId');
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-item-id', logger);
    return { deleted: false, agentic: null, reason: 'missing-item-id' };
  }
  const resolved = resolveAgenticArtikelNummer(itemId, logger);
  if (!resolved.artikelNummer) {
    const reason = resolved.reason ?? 'missing-artikel-nummer';
    logger.warn?.('[agentic-service] deleteAgenticRun failed to resolve Artikel_Nummer', { itemId, reason });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, reason, logger);
    return { deleted: false, agentic: null, reason };
  }
  const artikelNummer = resolved.artikelNummer;

  const actor = (input.actor || '').trim();
  if (!actor) {
    logger.warn?.('[agentic-service] deleteAgenticRun missing actor', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-actor', logger);
    return { deleted: false, agentic: null, reason: 'missing-actor' };
  }

  const existing = fetchAgenticRun(artikelNummer, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] deleteAgenticRun attempted without existing run', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-found', logger);
    return { deleted: false, agentic: null, reason: 'not-found' };
  }

  const normalizedStatus = normalizeAgenticRunStatus(existing.Status);
  if (normalizedStatus === AGENTIC_RUN_STATUS_NOT_STARTED) {
    logger.info?.('[agentic-service] deleteAgenticRun skipped because run is not started', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-started', logger);
    return { deleted: false, agentic: existing, reason: 'not-started' };
  }

  const nowIso = resolveNow(deps).toISOString();
  const deletionReason = input.reason && input.reason.trim() ? input.reason.trim() : null;
  const deleteStatement = deps.db.prepare('DELETE FROM agentic_runs WHERE Artikel_Nummer = ?');

  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);
  const txn = deps.db.transaction(() => {
    const deleteResult = deleteStatement.run(artikelNummer);
    if (!deleteResult?.changes) {
      throw new Error('Failed to delete agentic run');
    }

    const insertResult = deps.upsertAgenticRun.run({
      Artikel_Nummer: artikelNummer,
      SearchQuery: existing.SearchQuery ?? null,
      Status: AGENTIC_RUN_STATUS_NOT_STARTED,
      LastModified: nowIso,
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null
    });

    if (!insertResult?.changes) {
      throw new Error('Failed to recreate agentic run after deletion');
    }

    try {
      deps.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: 'AgenticRunReset',
        Meta: JSON.stringify({
          previousStatus: existing.Status ?? null,
          reason: deletionReason,
          resetAt: nowIso
        })
      });
    } catch (err) {
      logger.error?.('[agentic-service] Failed to record agentic reset event', {
        artikelNummer,
        error: toErrorMessage(err)
      });
      throw err;
    }
  });

  try {
    txn();
    finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to delete agentic run', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = fetchAgenticRun(artikelNummer, deps, logger);
  return { deleted: true, agentic: refreshed };
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

  const resolved = resolveAgenticArtikelNummer(itemId, logger);
  if (!resolved.artikelNummer) {
    const reason = resolved.reason ?? 'missing-artikel-nummer';
    logger.warn?.('[agentic-service] restartAgenticRun failed to resolve Artikel_Nummer', {
      itemId,
      reason,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, reason, logger);
    return { agentic: null, queued: false, created: false, reason };
  }
  const artikelNummer = resolved.artikelNummer;
  logger.info?.('[agentic-service] Resolved Artikel_Nummer for agentic run restart', {
    itemId: resolved.sourceItemId,
    artikelNummer,
    context: input.context ?? null
  });

  const existing = fetchAgenticRun(artikelNummer, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] restartAgenticRun missing search query', {
      artikelNummer,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  if (!hasAgenticReference(artikelNummer, deps, logger, input.context ?? null, 'restartAgenticRun')) {
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-reference', logger);
    return { agentic: existing, queued: false, created: false, reason: 'missing-reference' };
  }

  // TODO(agentic-restart): Keep review metadata reset aligned with queued restart behavior.
  const hasReviewPayload = input.review != null;
  const review = hasReviewPayload ? normalizeReviewMetadata(input.review ?? null, existing, logger) : null;
  const nowIso = resolveNow(deps).toISOString();
  const actor = input.actor?.trim() || null;
  const context = input.context?.trim() || null;
  const shouldClearReviewMetadata = !hasReviewPayload;
  const reviewState = shouldClearReviewMetadata
    ? 'not_required'
    : review?.state ?? existing?.ReviewState ?? 'not_required';
  const reviewedBy = shouldClearReviewMetadata ? null : review?.reviewedBy ?? existing?.ReviewedBy ?? null;
  const lastReviewDecision = shouldClearReviewMetadata ? null : review?.decision ?? null;
  const lastReviewNotes = shouldClearReviewMetadata ? null : review?.notes ?? null;
  recordRequestLogStart(request, searchQuery, logger);

  if (shouldClearReviewMetadata) {
    logger.info?.('[agentic-service] Clearing review metadata for queued restart', {
      artikelNummer,
      context
    });
  }
  const txn = deps.db.transaction(() => {
    if (existing) {
      const updateResult = deps.updateAgenticRunStatus.run(
        normalizeAgenticStatusUpdate({
          Artikel_Nummer: artikelNummer,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          SearchQuery: searchQuery,
          LastModified: nowIso,
          ReviewState: reviewState,
          ReviewedBy: reviewedBy,
          ReviewedByIsSet: true,
          LastReviewDecision: lastReviewDecision,
          LastReviewDecisionIsSet: true,
          LastReviewNotes: lastReviewNotes,
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
        Artikel_Nummer: artikelNummer,
        SearchQuery: searchQuery,
        Status: AGENTIC_RUN_STATUS_QUEUED,
        LastModified: nowIso,
        ReviewState: reviewState,
        ReviewedBy: reviewedBy,
        LastReviewDecision: lastReviewDecision,
        LastReviewNotes: lastReviewNotes
      });
    }

    try {
      deps.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
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
    } catch (err) {
      logger.error?.('[agentic-service] Failed to record agentic restart event', {
        artikelNummer,
        error: toErrorMessage(err)
      });
      throw err;
    }
  });

  try {
    txn();
  } catch (err) {
    logger.error?.('[agentic-service] Failed to restart agentic run', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = fetchAgenticRun(artikelNummer, deps, logger);

  recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
    searchQuery,
    logger
  });

  scheduleAgenticModelInvocation({
    artikelNummer,
    searchQuery,
    context,
    review,
    request,
    deps,
    logger
  });

  logger.info?.('[agentic-service] Agentic run restart queued for asynchronous execution', {
    artikelNummer,
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

export function mapReviewHistoryForAggregation(
  history: AgenticRunReviewHistoryEntry[]
): AgenticRunReviewMetadata[] {
  return history.map((entry) => {
    let parsedMetadata: Record<string, unknown> = {};
    try {
      parsedMetadata =
        typeof entry.ReviewMetadata === 'string' && entry.ReviewMetadata.trim()
          ? (JSON.parse(entry.ReviewMetadata) as Record<string, unknown>)
          : {};
    } catch {
      parsedMetadata = {};
    }

    return {
      decision: entry.ReviewDecision ?? null,
      information_present: normalizeNullableBoolean(parsedMetadata.information_present),
      missing_spec: normalizeMissingSpec(parsedMetadata.missing_spec),
      bad_format: normalizeNullableBoolean(parsedMetadata.bad_format),
      wrong_information: normalizeNullableBoolean(parsedMetadata.wrong_information),
      wrong_physical_dimensions: normalizeNullableBoolean(parsedMetadata.wrong_physical_dimensions),
      notes: entry.ReviewNotes ?? null,
      reviewedBy: entry.ReviewedBy ?? null
    };
  });
}

function resolveReviewFromPersistedRun(
  run: AgenticRun | null,
  history: AgenticRunReviewHistoryEntry[] = []
): AgenticRunReviewMetadata | null {
  const latestHistory = history.length > 0 ? history[history.length - 1] : null;
  const decision = latestHistory?.ReviewDecision ?? run?.LastReviewDecision ?? null;
  const notes = latestHistory?.ReviewNotes ?? run?.LastReviewNotes ?? null;
  const reviewedBy = latestHistory?.ReviewedBy ?? run?.ReviewedBy ?? null;

  if (!decision && !notes && !reviewedBy) {
    return null;
  }

  return {
    decision,
    information_present: null,
    missing_spec: [],
    bad_format: null,
    wrong_information: null,
    wrong_physical_dimensions: null,
    notes,
    reviewedBy
  };
}

// TODO(agentic-resume): Persist request context metadata to forward during resume once storage exists.
// TODO(agentic-resume-logging): Revisit resume path logging once external orchestration replaces in-process dispatch.
export async function resumeStaleAgenticRuns(
  deps: AgenticServiceDependencies
): Promise<AgenticRunResumeResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);

  logger.info?.('[agentic-service] Evaluating stale agentic run resume path', {
    invoker: deps.invokeModel ? 'available' : 'missing'
  });

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
        artikelNummer: run.Artikel_Nummer,
        status: run.Status
      });
      continue;
    }

    try {
      logger.info?.('[agentic-service] Scheduling stale agentic run for resume', {
        artikelNummer: run.Artikel_Nummer,
        status: run.Status,
        invoker: deps.invokeModel ? 'available' : 'missing'
      });
      let reviewHistory: AgenticRunReviewHistoryEntry[] = [];
      try {
        reviewHistory = listAgenticRunReviewHistory(run.Artikel_Nummer);
      } catch (historyErr) {
        logger.warn?.('[agentic-service] Failed to load review history during stale run resume', {
          artikelNummer: run.Artikel_Nummer,
          error: toErrorMessage(historyErr)
        });
      }

      scheduleAgenticModelInvocation({
        artikelNummer: run.Artikel_Nummer,
        searchQuery,
        context: null,
        review: resolveReviewFromPersistedRun(run, reviewHistory),
        request: null,
        deps,
        logger
      });
      resumed += 1;
    } catch (err) {
      failed += 1;
      logger.error?.('[agentic-service] Failed to schedule stale agentic run during resume', {
        artikelNummer: run.Artikel_Nummer,
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

  // TODO(agentic-transcript-log-snippets): Unify terminal transcript rendering for request log updates once upstream exposes
  // richer log querying helpers.
  const normalizedStatus = normalizeAgenticRunStatus(status);
  const statusIsTerminal =
    AGENTIC_RUN_TERMINAL_STATUSES.has(normalizedStatus) || normalizedStatus === AGENTIC_RUN_STATUS_REVIEW;
  if (!statusIsTerminal) {
    return;
  }

  const transcriptHeading =
    normalizedStatus === AGENTIC_RUN_STATUS_CANCELLED
      ? 'Agentic run cancelled'
      : normalizedStatus === AGENTIC_RUN_STATUS_REVIEW
        ? 'Agentic run requires review'
        : 'Agentic run terminal update';
  const transcriptRequest = {
    status: normalizedStatus,
    searchQuery: options.searchQuery ?? null,
    requestId: normalized.id,
    error: options.error ?? null,
    payloadCaptured: normalized.payloadDefined,
    notification: normalized.notificationDefined ? normalized.notification ?? null : null,
    requestLogSnapshot: {
      status: normalizedStatus,
      error: options.error ?? null,
      recordedAt: new Date().toISOString(),
      searchQuery: options.searchQuery ?? null
    }
  };
  const responseSummary = options.error
    ? `Agentic run reached ${normalizedStatus} with error: ${options.error}`
    : `Agentic run reached ${normalizedStatus}.`;

  void appendOutcomeTranscriptSection(normalized.id, transcriptHeading, transcriptRequest, responseSummary, logger).catch(
    (err) => {
      logger.warn?.('[agentic-service] Failed to append terminal request log transcript section', {
        requestId: normalized.id,
        status: normalizedStatus,
        error: err instanceof Error ? err.message : err
      });
    }
  );
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

  const resolved = resolveAgenticArtikelNummer(trimmed, logger);
  if (!resolved.artikelNummer) {
    logger.warn?.('[agentic-service] getAgenticStatus failed to resolve Artikel_Nummer', {
      itemId: trimmed,
      reason: resolved.reason ?? 'missing-artikel-nummer'
    });
    return { agentic: null };
  }

  return { agentic: fetchAgenticRun(resolved.artikelNummer, deps, logger) };
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
    logger.info?.('[agentic-service] Running agentic health check via in-process store', {
      requestId: request?.id ?? null,
      requestLogged: Boolean(request)
    });
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
