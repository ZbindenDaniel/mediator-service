import { query, queryOne, execute, withTransaction } from '../db-client';
import {
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_AUTO_APPROVED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_TERMINAL_STATUSES,
  type AgenticRun,
  type AgenticRunCancelInput,
  type AgenticRunCancelResult,
  type AgenticRunDeleteInput,
  type AgenticRunDeleteResult,
  type AgenticRunSearchLinkRemoveInput,
  type AgenticRunSearchLinkRemoveResult,
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
  normalizeAgenticRunStatus,
  AGENTIC_REVIEW_SPEC_MAX_ENTRIES,
  AGENTIC_REVIEW_SPEC_MAX_TOKENS_PER_ENTRY
} from '../../models';
// TODO(agentic-run-delete): Confirm deletion flows preserve observability requirements as APIs evolve.
import { appendTranscriptSection, createTranscriptWriter } from './flow/transcript';
import {
  logAgenticRequestStart,
  logAgenticRequestEnd,
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure,
  claimQueuedAgenticRuns,
  claimNotStartedAgenticRuns,
  enrolItemRefsWithoutAgenticRun,
  listItemRefsWithoutAgenticRun,
  updateQueuedAgenticRunQueueState,
  getSystemSetting,
  setSystemSetting,
  listAgenticRunReviewHistory,
  listContractAuditCandidates,
  listContractAuditSubcategories,
  stampAgenticRunContractVersion,
  type AgenticRunQueueUpdate,
  type LogEventPayload
} from '../db';
import { locateTranscript } from './flow/transcript';
import { autoReworkConfig, autoReviewConfig, autoApproveConfig } from './config';
import { attachCurrentReviewSignals, isValidateOnlyEligible } from './reference-findings';
import { getSpecContract, getStandardsContract } from '../contracts/registry';
import { checkSpecGap, type SpecContract } from '../../models/spec-contract';
import { parseLangtext } from '../lib/langtext';

export interface AgenticServiceLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
  debug?: Console['debug'];
}

export type AgenticModelInvokerFn = (
  input: AgenticModelInvocationInput
) => Promise<AgenticModelInvocationResult>;

export interface AgenticServiceDependencies {
  getAgenticRun: (id: string) => Promise<AgenticRun | null>;
  getItemReference: (id: string) => Promise<any>;
  upsertAgenticRun: (params: Record<string, unknown>) => Promise<void>;
  updateAgenticRunStatus: (params: Record<string, unknown>) => Promise<number>;
  updateQueuedAgenticRunQueueState?: (update: AgenticRunQueueUpdate) => void;
  logEvent: (payload: LogEventPayload) => Promise<void> | void;
  updateAgenticReview?: any;
  findByMaterial?: (artikelNummer: string) => Promise<any[]>;
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

type RestartReviewDecision = 'preserved' | 'merged' | 'cleared' | 'replaced';

const REQUEST_STATUS_SUCCESS = 'SUCCESS';
const REQUEST_STATUS_FAILED = 'FAILED';
const REQUEST_STATUS_DECLINED = 'DECLINED';
const REQUEST_STATUS_CANCELLED = 'CANCELLED';

// In-memory store for image data pending OCR extraction. Keyed by Artikel_Nummer.
// Entries are written when a run is queued with imageData and consumed once by the dispatcher.
// This is intentionally transient: if the server restarts before dispatch, OCR is simply skipped.
const pendingOcrImageData = new Map<string, string>();

// Tracks runs queued with skipSearch=true so the dispatcher can pass the flag to the invoker.
// Same transience caveat as pendingOcrImageData — lost on restart, which is fine.
const pendingSkipSearch = new Set<string>();

// Tracks runs the enrol-time triage routed to the validate-only path (assess existing data, no LLM).
// Lost on restart, which is safe: the run then falls back to a normal full run — more expensive, not wrong.
const pendingValidateOnly = new Set<string>();

// Circuit-breaker: the self-heal sweep must never re-process the same item more than once per cooldown,
// so a single item that stays stale (e.g. a mis-categorized item whose required field can't be filled)
// can't burn tokens in a tight loop. The version stamp is the primary mechanism (a healed item drops out
// of the stale set); this is the belt-and-braces that bounds the damage if the stamp ever fails to stick.
// In-memory and per-process — lost on restart, which is fine (a restart already clears any loop).
const SELF_HEAL_COOLDOWN_MS = 30 * 60 * 1000;
const selfHealEnqueuedAt = new Map<string, number>();

// Tracks targeted-rework parameters for a queued run so the dispatcher can pass them to the invoker.
// Same transience caveat as pendingOcrImageData — lost on restart (the run then falls back to a
// normal full re-run, which is safe).
const pendingRework = new Map<string, { fields: string[]; instructions: string | null }>();

// Operator "run the self-heal sweep now" request (admin endpoint). The dispatcher consumes it on its
// next tick, running one sweep pass even if it would otherwise skip this cycle. One-shot flag, not a
// count — a burst of clicks still means "run on the next tick". Lost on restart, which is fine.
let forcedSelfHealSweep = false;
export function requestSelfHealSweep(): void {
  forcedSelfHealSweep = true;
}
function consumeForcedSelfHealSweep(): boolean {
  const was = forcedSelfHealSweep;
  forcedSelfHealSweep = false;
  return was;
}

// TODO(agentic-flag-normalization): Fold boolean-to-integer coercion into the shared DB layer
// once SQLite bindings accept native booleans in our migration plan.
type AgenticRunStatusFlag =
  | 'ReviewedByIsSet'
  | 'LastReviewDecisionIsSet'
  | 'LastReviewNotesIsSet'
  | 'RetryCountIsSet'
  | 'NextRetryAtIsSet'
  | 'LastErrorIsSet'
  | 'LastAttemptAtIsSet'
  | 'LastSearchLinksJsonIsSet';

const AGENTIC_STATUS_UPDATE_FLAGS: AgenticRunStatusFlag[] = [
  'ReviewedByIsSet',
  'LastReviewDecisionIsSet',
  'LastReviewNotesIsSet',
  'RetryCountIsSet',
  'NextRetryAtIsSet',
  'LastErrorIsSet',
  'LastAttemptAtIsSet',
  'LastSearchLinksJsonIsSet'
];

// Only 'running' runs: stale 'queued' ones are picked up by the dispatcher's claim (claim model, #913).
const SELECT_STALE_AGENTIC_RUNS_SQL = `
  SELECT "Id", "Artikel_Nummer", "SearchQuery", "LastSearchLinksJson", "Status", "LastModified", "ReviewState", "ReviewedBy",
         "LastReviewDecision", "LastReviewNotes", "RetryCount", "NextRetryAt", "LastError", "LastAttemptAt"
    FROM agentic_runs
   WHERE "Status" = 'running'
   ORDER BY "LastModified" ASC, "Id" ASC
`;

const MAX_CONCURRENT_RUNNING_RUNS = 3;
// The waiting (queued) backlog is capped with the same parameter as the running cap, so the auto-feeder
// maintains at most N running + N waiting instead of pulling the entire notStarted table into the queue.
const MAX_WAITING_RUNS = MAX_CONCURRENT_RUNNING_RUNS;
const STALE_RUN_TIMEOUT_MINUTES = 10;

// Admin kill switch for the keep-busy auto-feeder. Stored in system_settings; default ON when unset
// (only an explicit 'false' disables), so existing deployments keep working after upgrade.
const AGENTIC_AUTO_DISPATCH_SETTING_KEY = 'agentic_auto_dispatch_enabled';

async function isAutoDispatchEnabled(logger: AgenticServiceLogger): Promise<boolean> {
  try {
    const value = await getSystemSetting(AGENTIC_AUTO_DISPATCH_SETTING_KEY);
    return value !== 'false';
  } catch (err) {
    // Fail open: a settings-read error must not silently stall the pipeline.
    logger.warn?.('[agentic-service] Failed to read auto-dispatch setting; defaulting to enabled', {
      error: toErrorMessage(err)
    });
    return true;
  }
}

// --- Cockpit levers: runtime-toggleable auto-flags, persisted in system_settings -------------------
// AUTO_APPROVE/REWORK/REVIEW ship as env booleans resolved once at boot (config.ts). The cockpit needs
// to flip them at runtime WITHOUT a redeploy and have the choice survive a restart. Mechanism: the
// dispatcher reads `autoReworkConfig.enabled` etc. live every tick, so mutating the config object takes
// effect immediately; we persist the chosen value to system_settings and re-hydrate the objects at
// startup. A stored setting (operator's last choice) therefore wins over the env default once set — the
// env var only seeds the very first boot. Mirrors the auto-dispatch toggle pattern.
export type AgenticFlagKey = 'autoApprove' | 'autoRework' | 'autoReview';
const AGENTIC_FLAG_SETTING_KEYS: Record<AgenticFlagKey, string> = {
  autoApprove: 'agentic_auto_approve_enabled',
  autoRework: 'agentic_auto_rework_enabled',
  autoReview: 'agentic_auto_review_enabled'
};
const AGENTIC_FLAG_CONFIGS: Record<AgenticFlagKey, { enabled: boolean }> = {
  autoApprove: autoApproveConfig,
  autoRework: autoReworkConfig,
  autoReview: autoReviewConfig
};

// Load any persisted flag overrides into the live config objects. Call once at server startup, after the
// DB is reachable. A missing/unparseable setting leaves the env-seeded default in place.
export async function hydrateAgenticFlagsFromSettings(logger: AgenticServiceLogger = console): Promise<void> {
  for (const key of Object.keys(AGENTIC_FLAG_SETTING_KEYS) as AgenticFlagKey[]) {
    try {
      const stored = await getSystemSetting(AGENTIC_FLAG_SETTING_KEYS[key]);
      if (stored === 'true' || stored === 'false') {
        AGENTIC_FLAG_CONFIGS[key].enabled = stored === 'true';
      }
    } catch (err) {
      logger.warn?.('[agentic-service] Failed to hydrate agentic flag; keeping env default', {
        flag: key,
        error: toErrorMessage(err)
      });
    }
  }
}

// Flip a flag now (mutates the live config object) and persist it so it survives restart.
export async function setAgenticFlag(flag: AgenticFlagKey, enabled: boolean): Promise<void> {
  AGENTIC_FLAG_CONFIGS[flag].enabled = enabled;
  await setSystemSetting(AGENTIC_FLAG_SETTING_KEYS[flag], enabled ? 'true' : 'false');
}

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

  // TODO(agentic-status-update-bindings): Keep default parameter bindings synchronized with SQL named parameters.
  for (const flag of AGENTIC_STATUS_UPDATE_FLAGS) {
    const value = Object.prototype.hasOwnProperty.call(normalized, flag) ? normalized[flag] : 0;
    if (typeof value === 'boolean') {
      normalized[flag] = value ? 1 : 0;
    } else if (typeof value === 'number' || typeof value === 'bigint') {
      normalized[flag] = Number(value);
    } else {
      normalized[flag] = value ?? 0;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(normalized, 'LastSearchLinksJson')) {
    normalized.LastSearchLinksJson = null;
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

async function fetchRunningCount(deps: AgenticServiceDependencies, logger: AgenticServiceLogger): Promise<number> {
  const runningRow = await queryOne<{ runningcount?: number }>(
    `SELECT COUNT(*) as runningcount FROM agentic_runs WHERE "Status" = $1`,
    [AGENTIC_RUN_STATUS_RUNNING]
  );
  const count = Number.isFinite(runningRow?.runningcount) ? Number(runningRow?.runningcount) : 0;
  // logger.info?.('[agentic-service] Fetched running agentic run count', { runningCount: count });
  return count;
}

async function fetchStatusCount(status: string): Promise<number> {
  const row = await queryOne<{ statuscount?: number }>(
    `SELECT COUNT(*) as statuscount FROM agentic_runs WHERE "Status" = $1`,
    [status]
  );
  return Number.isFinite(row?.statuscount) ? Number(row?.statuscount) : 0;
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

// A run can die in the queue — before it ever reaches the invoker — via three paths that previously
// left only a terse warn: a stale/zombie `running` reclaim, an over-cap cancellation, and an empty
// `SearchQuery`. This records each one legibly in BOTH places an operator looks: a structured
// from→to/reason log line, and an `AgenticRunFailed` item event so the transition shows up in the item's
// history (the queue paths emitted no event at all, hence "waiting runs fall to failed untraceably").
// `category` distinguishes an infrastructure cancellation (capacity/zombie reclaim — not the run's
// fault) from a genuine invalid-state failure, without yet changing the terminal status itself.
async function recordQueueTerminalTransition(
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger,
  params: {
    artikelNummer: string;
    fromStatus: string | null;
    reason: string;
    category: 'infra-cancelled' | 'invalid-state';
    retryCount?: number | null;
  }
): Promise<void> {
  const { artikelNummer, fromStatus, reason, category, retryCount } = params;
  logger.warn?.('[agentic-service] Queue terminal transition', {
    artikelNummer,
    from: fromStatus ?? null,
    to: AGENTIC_RUN_STATUS_FAILED,
    reason,
    category,
    retryCount: retryCount ?? null
  });
  try {
    await deps.logEvent({
      Actor: 'agentic-service',
      EntityType: 'Item',
      EntityId: artikelNummer,
      Event: 'AgenticRunFailed',
      Meta: JSON.stringify({
        from: fromStatus ?? null,
        to: AGENTIC_RUN_STATUS_FAILED,
        reason,
        category,
        failedAt: new Date().toISOString()
      })
    });
  } catch (eventErr) {
    logger.error?.('[agentic-service] Failed to record queue terminal transition event', {
      artikelNummer,
      reason,
      error: toErrorMessage(eventErr)
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

  return { artikelNummer: trimmed, reason: null, sourceItemId: trimmed };
}

async function hasAgenticReference(
  artikelNummer: string,
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger,
  context: string | null,
  source: string
): Promise<boolean> {
  try {
    const referenceRow = await deps.getItemReference(artikelNummer) as { Artikel_Nummer?: string } | undefined | null;
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
const REVIEW_MISSING_SPEC_MAX_COUNT = AGENTIC_REVIEW_SPEC_MAX_ENTRIES;
const REVIEW_MISSING_SPEC_MAX_TOKENS_PER_ENTRY = AGENTIC_REVIEW_SPEC_MAX_TOKENS_PER_ENTRY;

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

function normalizeSpecList(rawSpecList: unknown): string[] {
  if (!Array.isArray(rawSpecList) || rawSpecList.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const rawEntry of rawSpecList) {
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
      unneeded_spec: [],
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
    const missing_spec = normalizeSpecList(base.missing_spec);
    const unneeded_spec = normalizeSpecList(base.unneeded_spec);

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
        missing_spec_count: missing_spec.length,
        unneeded_spec_count: unneeded_spec.length
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
      unneeded_spec,
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
      unneeded_spec: [],
      bad_format: null,
      wrong_information: null,
      wrong_physical_dimensions: null,
      notes: null,
      reviewedBy: null,
      state: fallback?.ReviewState?.trim() || null
    };
  }
}

function toReviewSnapshot(
  review: NormalizedReviewMetadata | null,
  fallback: AgenticRun | null
): Record<string, unknown> {
  const snapshot = review ?? {
    state: fallback?.ReviewState ?? null,
    decision: fallback?.LastReviewDecision ?? null,
    notes: fallback?.LastReviewNotes ?? null,
    reviewedBy: fallback?.ReviewedBy ?? null,
    information_present: null,
    missing_spec: [],
    unneeded_spec: [],
    bad_format: null,
    wrong_information: null,
    wrong_physical_dimensions: null
  };

  return {
    state: snapshot.state ?? null,
    decisionPresent: Boolean(snapshot.decision),
    notesPresent: Boolean(snapshot.notes),
    reviewedByPresent: Boolean(snapshot.reviewedBy),
    information_present: snapshot.information_present ?? null,
    bad_format: snapshot.bad_format ?? null,
    wrong_information: snapshot.wrong_information ?? null,
    wrong_physical_dimensions: snapshot.wrong_physical_dimensions ?? null,
    missing_spec_count: Array.isArray(snapshot.missing_spec) ? snapshot.missing_spec.length : 0,
    unneeded_spec_count: Array.isArray(snapshot.unneeded_spec) ? snapshot.unneeded_spec.length : 0
  };
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

async function fetchAgenticRun(
  itemId: string,
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): Promise<AgenticRun | null> {
  try {
    const result = await deps.getAgenticRun(itemId);
    return attachTranscriptReference(result ?? null, itemId, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to load agentic run', {
      itemId,
      error: err instanceof Error ? err.message : err
    });
    throw err;
  }
}

async function persistQueuedRun(
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
): Promise<AgenticRun | null> {
  const now = resolveNow(deps).toISOString();
  const reviewDecision = payload.review?.decision ?? null;
  const reviewNotes = payload.review?.notes ?? null;
  const reviewState = payload.review?.state ?? 'not_required';
  const reviewedBy = payload.review?.reviewedBy ?? null;

  try {
    await deps.upsertAgenticRun({
      Artikel_Nummer: payload.artikelNummer,
      SearchQuery: payload.searchQuery,
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: now,
      ReviewState: reviewState,
      ReviewedBy: reviewedBy,
      LastReviewDecision: reviewDecision,
      LastReviewNotes: reviewNotes,
      LastSearchLinksJson: null
    });
  } catch (err) {
    logger.error?.('[agentic-service] Failed to upsert agentic run during queue', {
      artikelNummer: payload.artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    throw err;
  }

  try {
    await deps.logEvent({
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
  imageData?: string | null;
  skipSearch?: boolean;
  validateOnly?: boolean;
  reworkSpecFields?: string[] | null;
  reworkInstructions?: string | null;
}

async function scheduleAgenticModelInvocation(payload: BackgroundInvocationPayload): Promise<void> {
  const { deps, logger } = payload;
  const invokeModel = deps.invokeModel;
  if (!invokeModel) {
    // TODO(agentic-scheduler): Record missing invoker metadata so stalled runs surface in ops dashboards.
    const nowIso = resolveNow(deps).toISOString();
    let existingRun: AgenticRun | null = null;

    try {
      existingRun = await fetchAgenticRun(payload.artikelNummer, deps, logger);
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
      existingRun = await fetchAgenticRun(payload.artikelNummer, deps, logger);
    } catch (err) {
      logger.error?.('[agentic-service] Failed to load existing run before invocation', {
        artikelNummer: payload.artikelNummer,
        context: payload.context,
        error: toErrorMessage(err)
      });
    }

    const attemptTimestamp = nowIso;
    const nextRetryCount = (existingRun?.RetryCount ?? 0) + 1;

    // claimQueuedAgenticRuns already moved the row to 'running' atomically via FOR UPDATE
    // SKIP LOCKED, so multi-instance double-claiming is prevented at the DB level. We still
    // re-read here to pick up the latest field values (SearchQuery etc.) and to catch the
    // edge case where the run was cancelled between claim and execution.
    let promoted = false;
    try {
      promoted = await withTransaction(async (_client) => {
        const latestRun = await fetchAgenticRun(payload.artikelNummer, deps, logger);
        if (!latestRun || latestRun.Status !== AGENTIC_RUN_STATUS_RUNNING) {
          return false;
        }
        const updateResult = await deps.updateAgenticRunStatus(
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
        if (!updateResult) {
          logger.warn?.('[agentic-service] Agentic run mark-running updated zero rows', {
            artikelNummer: payload.artikelNummer
          });
          return false;
        }
        logger.info?.('[agentic-service] Agentic run marked running prior to invocation', {
          artikelNummer: payload.artikelNummer,
          context: payload.context
        });
        return true;
      });
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

    if (!promoted) {
      // The run was not promoted — leave it in queued state for the next dispatch cycle.
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
          existingRun = await fetchAgenticRun(payload.artikelNummer, deps, logger);
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

        // A failed run is terminal and idle: it is NOT auto-requeued. Transient hiccups (search/LLM
        // timeouts) are absorbed by in-process retries *within* a single run; a run that still fails is
        // left FAILED for a manual re-trigger. Auto-requeuing here previously fed a runaway retry storm
        // (compounded by the keep-busy feeder resetting RetryCount), so recovery no longer loops through
        // the dispatcher. Status stays FAILED — never 'cancelled', which is reserved for explicit user
        // stops; the reason lives in LastError.
        const willRetry = false;
        const nextRetryAt = null;
        const recoveryStatus = AGENTIC_RUN_STATUS_FAILED;

        try {
          const updateResult = await deps.updateAgenticRunStatus(
            normalizeAgenticStatusUpdate({
              Artikel_Nummer: payload.artikelNummer,
              Status: recoveryStatus,
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
              NextRetryAt: nextRetryAt,
              NextRetryAtIsSet: true,
              LastError: lastError,
              LastErrorIsSet: true,
              LastAttemptAt: lastAttemptAt,
              LastAttemptAtIsSet: true
            })
          );

          if (!updateResult) {
            logger.warn?.('[agentic-service] Auto-cancel updated zero rows after failure', {
              artikelNummer: payload.artikelNummer,
              reason
            });
          } else {
            logger.info?.('[agentic-service] Agentic run auto-cancelled after failure', {
              artikelNummer: payload.artikelNummer,
              reason,
              recoveryStatus,
              willRetry,
              nextRetryAt
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
          // Retry attempts are re-queues, not cancellations; only the exhausted give-up is a failure.
          await deps.logEvent({
            Actor: 'agentic-service',
            EntityType: 'Item',
            EntityId: payload.artikelNummer,
            Event: willRetry ? 'AgenticRunRequeued' : 'AgenticRunFailed',
            Meta: JSON.stringify({
              previousStatus: existingRun?.Status ?? null,
              [willRetry ? 'requeuedAt' : 'failedAt']: cancelTimestamp,
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
        requestId: payload.request?.id ?? null,
        imageData: payload.imageData ?? null,
        skipSearch: payload.skipSearch ?? false,
        validateOnly: payload.validateOnly ?? false,
        reworkSpecFields: payload.reworkSpecFields ?? null,
        reworkInstructions: payload.reworkInstructions ?? null
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
export async function dispatchQueuedAgenticRuns(
  deps: AgenticServiceDependencies,
  { limit }: { limit?: number } = {}
): Promise<{ scheduled: number; skipped: number; failed: number }> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  lastDispatchDeps = deps; // capture for the admin "run sweep now" path (same wiring as the interval)
  const effectiveLimit = Number.isFinite(limit) && (limit ?? 0) > 0 ? Math.floor(limit as number) : 5;

  // Recover stale "running" runs that have been in-progress beyond the timeout.
  // This unblocks the queue when a previous invocation hung or crashed without
  // updating the run's status. Updates are awaited before fetchRunningCount so the
  // freed slots are visible in the same dispatch cycle (fire-and-forget caused a race).
  try {
    const nowIso = resolveNow(deps).toISOString();
    const staleRuns = await query<{
      Artikel_Nummer: string;
      RetryCount: number | null;
      LastAttemptAt: string | null;
    }>(
      // NULL LastAttemptAt is also stale — it means promotion never recorded a timestamp
      `SELECT "Artikel_Nummer", "RetryCount", "LastAttemptAt"
         FROM agentic_runs
        WHERE "Status" = 'running'
          AND ("LastAttemptAt" IS NULL
               OR "LastAttemptAt"::timestamptz < NOW() - INTERVAL '${STALE_RUN_TIMEOUT_MINUTES} minutes')`,
      []
    );
    await Promise.allSettled(staleRuns.map(async (staleRun) => {
      const retryCount = staleRun.RetryCount ?? 0;
      // A zombie run (stuck 'running' past the timeout — crash/restart mid-invocation) is recovered to
      // terminal FAILED, not requeued. This frees the running slot (the original reason for recovery)
      // without re-injecting the run into the pipeline, consistent with "failed runs stay idle". The
      // item can be re-triggered manually if needed.
      logger.warn?.('[agentic-service] Recovering stale running agentic run', {
        artikelNummer: staleRun.Artikel_Nummer,
        lastAttemptAt: staleRun.LastAttemptAt,
        staleTimeoutMinutes: STALE_RUN_TIMEOUT_MINUTES,
        retryCount
      });
      const updateQueueState = deps.updateQueuedAgenticRunQueueState ?? updateQueuedAgenticRunQueueState;
      await updateQueueState({
        Artikel_Nummer: staleRun.Artikel_Nummer,
        Status: AGENTIC_RUN_STATUS_FAILED,
        LastModified: nowIso,
        RetryCount: retryCount,
        NextRetryAt: null,
        LastError: 'stale-run-auto-cancelled',
        LastAttemptAt: staleRun.LastAttemptAt ?? nowIso
      });
      await recordQueueTerminalTransition(deps, logger, {
        artikelNummer: staleRun.Artikel_Nummer,
        fromStatus: AGENTIC_RUN_STATUS_RUNNING,
        reason: 'stale-run-auto-cancelled',
        category: 'infra-cancelled',
        retryCount
      });
    }));
  } catch (err) {
    logger.error?.('[agentic-service] Failed to recover stale running runs', {
      error: toErrorMessage(err)
    });
  }

  // Enforce the concurrency cap: if somehow more than MAX runs are RUNNING (an over-claim race, a restart,
  // or manual DB edits), push the excess back to 'queued' so they WAIT for a free slot instead of being
  // cancelled. Over-cap is not the run's fault — it was triggered legitimately and should run once there is
  // space — so failing it (the previous behavior) surfaced as "queued run moved to running then cancelled
  // immediately". We keep the runs with the OLDEST LastAttemptAt running (those are the ones actually
  // making progress in a background invocation) and requeue the freshest excess (a racing over-claim
  // stamps LastAttemptAt = now). A requeued run whose background invocation is still mid-flight is safe:
  // that task's promotion guard re-reads Status and bails when it is no longer 'running'.
  try {
    const overCapRuns = await query<{ Artikel_Nummer: string; RetryCount: number | null; LastAttemptAt: string | null }>(
      `SELECT "Artikel_Nummer", "RetryCount", "LastAttemptAt"
         FROM agentic_runs
        WHERE "Status" = 'running'
        ORDER BY "LastAttemptAt" ASC
        OFFSET $1`,
      [MAX_CONCURRENT_RUNNING_RUNS]
    );
    if (overCapRuns.length > 0) {
      logger.warn?.('[agentic-service] Over-cap running runs detected; requeuing freshest excess to wait', {
        count: overCapRuns.length,
        cap: MAX_CONCURRENT_RUNNING_RUNS
      });
      const nowIso = resolveNow(deps).toISOString();
      const updateQueueState = deps.updateQueuedAgenticRunQueueState ?? updateQueuedAgenticRunQueueState;
      await Promise.allSettled(overCapRuns.map(async (run) => {
        try {
          // Promotion to the waiting queue is not an attempt, so RetryCount is preserved (not reset) and
          // NextRetryAt stays clear so the queued→running claim can pick it up as soon as a slot frees.
          await updateQueueState({
            Artikel_Nummer: run.Artikel_Nummer,
            Status: AGENTIC_RUN_STATUS_QUEUED,
            LastModified: nowIso,
            RetryCount: run.RetryCount ?? 0,
            NextRetryAt: null,
            LastError: null,
            LastAttemptAt: run.LastAttemptAt ?? nowIso
          });
          logger.info?.('[agentic-service] Requeued over-cap running run to waiting queue', {
            artikelNummer: run.Artikel_Nummer,
            cap: MAX_CONCURRENT_RUNNING_RUNS
          });
        } catch (err) {
          logger.error?.('[agentic-service] Failed to requeue over-cap run', {
            artikelNummer: run.Artikel_Nummer,
            error: toErrorMessage(err)
          });
        }
      }));
    }
  } catch (err) {
    logger.error?.('[agentic-service] Failed to enforce concurrency cap on running runs', {
      error: toErrorMessage(err)
    });
  }

  // TODO(agentic-queue-fairness): Revisit slot selection policy if we later prioritize runs beyond FIFO ordering.
  let runningCount = 0;

  try {
    runningCount = await fetchRunningCount(deps, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to determine currently running agentic run count', {
      error: toErrorMessage(err)
    });
    return { scheduled: 0, skipped: 0, failed: 0 };
  }

  const availableSlots = Math.max(0, MAX_CONCURRENT_RUNNING_RUNS - runningCount);
  let queuedRuns: AgenticRun[] = [];

  if (availableSlots <= 0) {
    // No free running slot: don't promote queued→running this tick. We still fall through to the
    // auto-feeder below so the waiting buffer can be topped up while running is saturated.
    logger.info?.('[agentic-service] Skipping queued dispatch because running slot is occupied', {
      runningCount,
      maxConcurrentRunningRuns: MAX_CONCURRENT_RUNNING_RUNS
    });
  } else {
    try {
      // Pass the running cap so the claim self-limits to the free slots atomically: availableSlots here
      // is read non-atomically before the claim, so overlapping ticks / instances could otherwise each
      // claim up to availableSlots and together over-fill the running slots (the excess was then cancelled
      // by the over-cap sweep instead of waiting). The in-statement cap makes that impossible.
      queuedRuns = await claimQueuedAgenticRuns(Math.min(effectiveLimit, availableSlots), MAX_CONCURRENT_RUNNING_RUNS);
    } catch (err) {
      // Log and continue to the feeder rather than aborting the whole cycle.
      logger.error?.('[agentic-service] Failed to load queued agentic runs for dispatch', {
        error: toErrorMessage(err),
        limit: Math.min(effectiveLimit, availableSlots)
      });
    }
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

      applyQueueUpdate(deps, logger, {
        Artikel_Nummer: artikelNummer,
        Status: AGENTIC_RUN_STATUS_FAILED,
        LastModified: nowIso,
        RetryCount: retryCount,
        NextRetryAt: null,
        LastError: lastError,
        LastAttemptAt: lastAttemptAt
      });
      await recordQueueTerminalTransition(deps, logger, {
        artikelNummer,
        fromStatus: AGENTIC_RUN_STATUS_QUEUED,
        reason: lastError,
        category: 'invalid-state',
        retryCount
      });
      continue;
    }

    try {
      const imageData = pendingOcrImageData.get(artikelNummer) ?? null;
      if (imageData) {
        pendingOcrImageData.delete(artikelNummer);
      }
      const skipSearch = pendingSkipSearch.has(artikelNummer);
      if (skipSearch) {
        pendingSkipSearch.delete(artikelNummer);
      }
      const rework = pendingRework.get(artikelNummer) ?? null;
      if (rework) {
        pendingRework.delete(artikelNummer);
      }
      const validateOnly = pendingValidateOnly.has(artikelNummer);
      if (validateOnly) {
        pendingValidateOnly.delete(artikelNummer);
      }
      void scheduleAgenticModelInvocation({
        artikelNummer,
        searchQuery,
        context: null,
        review: null,
        request: null,
        imageData,
        skipSearch,
        validateOnly,
        reworkSpecFields: rework?.fields ?? null,
        reworkInstructions: rework?.instructions ?? null,
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

  // Keep-busy auto-feeder (admin-disablable, demoted): top up the WAITING queue with never-started runs
  // so running slots stay busy, without ever pulling in failed or cancelled runs. It only promotes
  // 'notStarted' → 'queued' and is capped at MAX_WAITING_RUNS total waiting, so the queue can hold at
  // most N running + N waiting instead of the whole notStarted backlog. The newly-queued runs are drained
  // into running by the queued→running claim on a subsequent tick — the feeder itself never invokes the
  // model. Previously this claimed failed/cancelled runs and promoted straight to running while resetting
  // RetryCount, which resurrected operator-cancelled runs and drove a runaway retry storm.
  let autoFed = 0;
  const autoDispatchEnabled = await isAutoDispatchEnabled(logger);
  if (autoDispatchEnabled) {
    try {
      const waitingCount = await fetchStatusCount(AGENTIC_RUN_STATUS_QUEUED);
      const feedSlots = Math.max(0, MAX_WAITING_RUNS - waitingCount);
      if (feedSlots > 0) {
        const fedRuns = await claimNotStartedAgenticRuns(feedSlots);
        autoFed = fedRuns.length;
        if (autoFed < feedSlots) {
          // notStarted pool exhausted: enrol just enough never-enrolled refs to fill the free slots, so
          // every ref eventually reaches the pipeline without flooding it.
          const toEnrol = feedSlots - autoFed;
          // Enrol-time triage: route refs whose EXISTING data is already complete + clean to the
          // validate-only path (assess, no LLM — saves the full run and avoids churning good data). The
          // list uses the same ordering as the enrol insert, so the marked refs are the ones enrolled.
          let validateOnlyMarked = 0;
          try {
            const candidates = await listItemRefsWithoutAgenticRun(toEnrol);
            for (const ref of candidates) {
              if (isValidateOnlyEligible(ref as Record<string, unknown>)) {
                pendingValidateOnly.add(ref.Artikel_Nummer);
                validateOnlyMarked += 1;
              }
            }
          } catch (err) {
            logger.warn?.('[agentic-service] Enrol-time triage failed; refs will take a full run', { error: toErrorMessage(err) });
          }
          const enrolled = await enrolItemRefsWithoutAgenticRun(toEnrol);
          if (enrolled > 0) {
            const enrolledRuns = await claimNotStartedAgenticRuns(toEnrol);
            autoFed += enrolledRuns.length;
            logger.info?.('[agentic-service] Enrolled item refs without an agentic run', { enrolled, validateOnly: validateOnlyMarked });
          }
        }
        if (autoFed > 0) {
          logger.info?.('[agentic-service] Auto-fed notStarted runs into waiting queue', {
            fed: autoFed,
            waitingBefore: waitingCount,
            waitingCap: MAX_WAITING_RUNS
          });
        }
      }
    } catch (err) {
      logger.error?.('[agentic-service] Failed to auto-feed notStarted agentic runs', {
        error: toErrorMessage(err)
      });
    }
  } else {
    logger.debug?.('[agentic-service] Auto-dispatch disabled; skipping notStarted feed');
  }

  // Self-heal sweeper (default off): re-apply the current contract/standards to the oldest stale item.
  // AUTO_REWORK covers the settled approved states; AUTO_REVIEW additionally re-judges version-stale items
  // stuck in manual review. Gated on the auto-dispatch kill switch too, since it is auto work.
  //
  // It runs when we did NOT just promote runs to running this cycle (`scheduled === 0`) — i.e. running is
  // full or idle — OR when an operator forced it via the admin endpoint. It deliberately does NOT require
  // `autoFed === 0`: the keep-busy feeder tops up the WAITING queue with notStarted items almost every
  // tick, so requiring a fed-free cycle starved the sweep indefinitely whenever any notStarted backlog
  // existed (the "flags on but nothing happens" report). One enqueue per tick keeps it gentle regardless.
  const forcedSweep = consumeForcedSelfHealSweep();
  if ((autoReworkConfig.enabled || autoReviewConfig.enabled) && autoDispatchEnabled && (forcedSweep || scheduled === 0)) {
    await sweepContractRework(deps, logger);
  }

  return { scheduled, skipped, failed };
}

// Pure decision for the idle contract-audit sweep (no DB/LLM) — exported for unit testing.
//  - `skip`    : the item's stored contract version is current (not stale).
//  - `rework`  : stale AND now missing required field(s) → enqueue a targeted rework for those keys.
//  - `restamp` : stale but already complete under the new contract → just re-stamp the version.
export function decideContractAuditAction(
  storedVersion: number | null,
  contractVersion: number,
  gapMissingRequired: string[]
): { action: 'skip' } | { action: 'restamp' } | { action: 'rework'; fields: string[] } {
  if (storedVersion != null && storedVersion >= contractVersion) {
    return { action: 'skip' };
  }
  if (gapMissingRequired.length > 0) {
    return { action: 'rework', fields: gapMissingRequired };
  }
  return { action: 'restamp' };
}

// Unified self-heal decision (no DB/LLM) — the "entry-point router". Given BOTH staleness axes it decides
// where a settled item must re-enter the pipeline:
//   • spec contract (SpecContractVersion) changed its fields → needs EXTRACTION to obtain new values;
//   • standards (StandardsVersion) changed the house rules    → needs a WORDING pass to re-apply them.
// Outcomes, cheapest-first:
//   - `skip`    : current on both axes.
//   - `restamp` : contract stale but already complete, standards current → just bump the version (no LLM).
//   - `rework`  : contract stale + missing required field(s), standards current → targeted extraction.
//                 NOTE: rework mode skips the wording stage, so it is only correct when standards are NOT
//                 also stale (otherwise the new house rules wouldn't be applied).
//   - `reword`  : standards stale, no extraction need → a search-free run whose wording pass re-applies
//                 the house rules. (A full run, not targeted — so wording runs.)
//   - `rerun`   : BOTH an extraction need AND standards staleness → a search-free FULL run so extraction
//                 and wording both happen; a targeted rework would skip wording.
// reword/rerun both execute as the same search-free run; they differ only in why they were chosen (kept
// distinct for legibility). The completed run stamps both versions, so the sweep self-limits either way.
export function decideSelfHealAction(
  contractStored: number | null,
  contractCurrent: number,
  standardsStored: number | null,
  standardsCurrent: number | null,
  gapMissingRequired: string[]
):
  | { action: 'skip' }
  | { action: 'restamp' }
  | { action: 'rework'; fields: string[] }
  | { action: 'reword' }
  | { action: 'rerun'; fields: string[] } {
  const contract = decideContractAuditAction(contractStored, contractCurrent, gapMissingRequired);
  const standardsStale = standardsCurrent != null && (standardsStored == null || standardsStored < standardsCurrent);
  if (contract.action === 'rework') {
    // Extraction is required. If standards are also stale, escalate to a full run so wording runs too
    // (a targeted rework skips the wording stage); otherwise the targeted rework is enough.
    return standardsStale ? { action: 'rerun', fields: contract.fields } : contract;
  }
  // contract is 'skip' or 'restamp' — no extraction needed. Standards staleness alone → a re-word.
  if (standardsStale) return { action: 'reword' };
  return contract;
}

// L4 (legible sweeper): one entry per stale item the self-heal sweep would act on. Lets the sweep
// log/preview the *whole* backlog instead of acting invisibly, and is the shape a dry-run surfaces to the
// operator before AUTO_REWORK is trusted on.
export interface ContractSweepPlanEntry {
  artikelNummer: string;
  subCategory: number;
  action: 'rework' | 'restamp' | 'reword' | 'rerun';
  /** For rework/rerun: the now-missing required fields that drove the extraction need. */
  fields?: string[];
  /** Spec-contract versions (the extraction axis). */
  fromVersion: number | null;
  toVersion: number;
  /** Standards versions (the wording axis) — set when the entry is driven by standards staleness. */
  standardsFromVersion?: number | null;
  standardsToVersion?: number | null;
  /** The run status this entry acts on (e.g. 'approved', 'review') — carried for legibility/logging. */
  status?: string;
}

type ContractAuditCandidate = {
  Artikel_Nummer: string;
  Status?: string;
  SubCategory: number | null;
  SpecContractVersion: number | null;
  StandardsVersion?: number | null;
  Langtext: string | null;
  Artikelbeschreibung?: string | null;
};

// Pure (no DB/LLM): the unified self-heal plan — maps candidate rows to the actions the sweep would take,
// in order, across BOTH staleness axes. `getContract` is injected for unit-testing without the registry;
// `standardsCurrent` is the current standards version (null disables the wording axis entirely, which is
// how `planContractSweep` reuses this for the contract-only view). Parsing/gap-check mirror the live sweep
// exactly, so the preview and the action can never disagree.
export function planSelfHealSweep(
  candidates: ContractAuditCandidate[],
  getContract: (subCategory: number) => SpecContract | null,
  standardsCurrent: number | null
): ContractSweepPlanEntry[] {
  const plan: ContractSweepPlanEntry[] = [];
  for (const candidate of candidates) {
    if (candidate.SubCategory == null) continue;
    // v1 scope: only items with a resolvable spec contract. Standards are global, but the wording pass
    // relies on the contract's recognizedSpecFields to avoid over-stripping, so contract-less subcategories
    // are left out of the standards re-word for now (see deferred note in the changelog).
    const contract = getContract(candidate.SubCategory);
    if (!contract) continue;
    const stored = typeof candidate.SpecContractVersion === 'number' ? candidate.SpecContractVersion : null;
    const standardsStored = typeof candidate.StandardsVersion === 'number' ? candidate.StandardsVersion : null;

    // Fast path: current on both axes → skip without parsing Langtext.
    const contractStale = stored == null || stored < contract.version;
    const standardsStale = standardsCurrent != null && (standardsStored == null || standardsStored < standardsCurrent);
    if (!contractStale && !standardsStale) continue;

    let langtextObj: Record<string, unknown> = {};
    try {
      const parsed = parseLangtext(candidate.Langtext, { context: 'contract-audit' });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) langtextObj = parsed as Record<string, unknown>;
    } catch {
      // Unparseable Langtext → empty; the gap check then flags required fields.
    }
    const gap = checkSpecGap(contract, langtextObj);
    const decision = decideSelfHealAction(stored, contract.version, standardsStored, standardsCurrent, gap.missingRequired);
    if (decision.action === 'skip') continue;
    const isReview = candidate.Status === AGENTIC_RUN_STATUS_REVIEW;
    // A pending-review item must never be silently re-stamped: that would mark it "current" and hide it
    // from the sweep without a human or the pipeline ever re-judging it. Only an actual re-run (which the
    // pipeline then re-judges) may touch a review item; a bare restamp is dropped to a skip.
    if (isReview && decision.action === 'restamp') continue;
    const base = {
      artikelNummer: candidate.Artikel_Nummer,
      subCategory: candidate.SubCategory,
      fromVersion: stored,
      toVersion: contract.version,
      ...(candidate.Status ? { status: candidate.Status } : {}),
      // Only carry the standards axis when it is active, so the contract-only plan/preview stays lean.
      ...(standardsCurrent != null ? { standardsFromVersion: standardsStored, standardsToVersion: standardsCurrent } : {})
    };
    if (decision.action === 'rework') plan.push({ ...base, action: 'rework', fields: decision.fields });
    else if (decision.action === 'rerun') plan.push({ ...base, action: 'rerun', fields: decision.fields });
    else if (decision.action === 'reword') plan.push({ ...base, action: 'reword' });
    else plan.push({ ...base, action: 'restamp' });
  }
  return plan;
}

// Contract-only view (standards axis disabled) — kept for the dry-run preview and existing callers/tests.
export function planContractSweep(
  candidates: ContractAuditCandidate[],
  getContract: (subCategory: number) => SpecContract | null
): ContractSweepPlanEntry[] {
  return planSelfHealSweep(candidates, getContract, null);
}

// Dry run: what the contract-audit sweep *would* do right now (contract axis only), without touching
// anything. Lets an operator see the stale backlog before enabling AUTO_REWORK.
export async function previewContractSweep(limit = 20): Promise<ContractSweepPlanEntry[]> {
  const candidates = await listContractAuditCandidates(limit);
  return planContractSweep(candidates, getSpecContract);
}

// Dry run: the full self-heal backlog across both axes (contract + standards), without touching anything.
export async function previewSelfHealSweep(limit = 20): Promise<ContractSweepPlanEntry[]> {
  const candidates = await listContractAuditCandidates(limit);
  return planSelfHealSweep(candidates, getSpecContract, getStandardsContract()?.version ?? null);
}

export interface SelfHealPreview {
  /** Which self-heal flags are currently on — so the UI can say "stale items exist but the flag is off". */
  flags: { autoRework: boolean; autoReview: boolean; autoApprove: boolean };
  /** Current standards version (null = no standards contract → the wording axis is inert). */
  standardsVersion: number | null;
  /** Stale, contract-covered candidate rows examined (capped at `limit`, oldest-first). */
  totalCandidates: number;
  /** How many of those are actually stale (what the sweep would act on). */
  staleCount: number;
  counts: { rework: number; restamp: number; reword: number; rerun: number };
  /** Stale count broken down by the run status the entry acts on (approved/auto_approved/review). */
  byStatus: Record<string, number>;
  items: ContractSweepPlanEntry[];
}

// Observable self-heal backlog for the admin surface: what the sweep sees across ALL eligible statuses
// (approved/auto_approved/review), regardless of which flags are on — so an operator can diagnose "why
// isn't it doing anything?" (nothing stale? no spec contract? a flag off?). Pure read, no side effects;
// it deliberately ignores the flag gating so turning a flag ON isn't a prerequisite for seeing the
// backlog it would act on.
export async function getSelfHealPreview(limit = 50): Promise<SelfHealPreview> {
  const statuses = [AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_AUTO_APPROVED, AGENTIC_RUN_STATUS_REVIEW];
  const standardsVersion = getStandardsContract()?.version ?? null;
  // Same pre-filtered source as the live sweep, so the preview never shows a backlog the sweep can't reach.
  const candidates = await loadStaleSelfHealCandidates(statuses, limit, 0, standardsVersion);
  const plan = planSelfHealSweep(candidates, getSpecContract, standardsVersion);
  const byStatus: Record<string, number> = {};
  for (const entry of plan) {
    const key = entry.status ?? 'unknown';
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  return {
    flags: { autoRework: autoReworkConfig.enabled, autoReview: autoReviewConfig.enabled, autoApprove: autoApproveConfig.enabled },
    standardsVersion,
    totalCandidates: candidates.length,
    staleCount: plan.length,
    counts: {
      rework: plan.filter((p) => p.action === 'rework').length,
      restamp: plan.filter((p) => p.action === 'restamp').length,
      reword: plan.filter((p) => p.action === 'reword').length,
      rerun: plan.filter((p) => p.action === 'rerun').length
    },
    byStatus,
    items: plan
  };
}

// The cockpit read model: the pipeline's state and its levers, composed for the KI cockpit surface.
// Deliberately NOT item-centric — it aggregates what an operator steers globally: the auto-flags, the
// gating thresholds, the live queue, and the self-heal backlog. One round-trip powers the levers strip.
export interface PipelineCockpit {
  /** Effective auto-flags (post-hydration — stored override or env default). */
  flags: { autoApprove: boolean; autoRework: boolean; autoReview: boolean };
  /** The keep-busy auto-feeder master switch (system_settings). */
  autoDispatch: boolean;
  /** Read-only gating thresholds, so the operator sees the rules the flags act under. */
  thresholds: { autoApproveMinGrade: number; maxWaitingRuns: number; selfHealCooldownMinutes: number };
  /** Live pipeline occupancy. `waiting` = queued, `running` = in flight, `notStarted` = enrolled backlog. */
  queue: { waiting: number; running: number; notStarted: number };
  /** The self-heal backlog (same numbers the admin self-heal preview reports). */
  selfHeal: {
    standardsVersion: number | null;
    staleCount: number;
    counts: { rework: number; restamp: number; reword: number; rerun: number };
    byStatus: Record<string, number>;
  };
}

export async function getPipelineCockpit(logger: AgenticServiceLogger = console): Promise<PipelineCockpit> {
  // Preview + counts are independent reads — run them together.
  const [preview, waiting, running, notStarted, autoDispatch] = await Promise.all([
    getSelfHealPreview(100),
    fetchStatusCount(AGENTIC_RUN_STATUS_QUEUED),
    fetchStatusCount(AGENTIC_RUN_STATUS_RUNNING),
    fetchStatusCount(AGENTIC_RUN_STATUS_NOT_STARTED),
    isAutoDispatchEnabled(logger)
  ]);
  return {
    flags: preview.flags,
    autoDispatch,
    thresholds: {
      autoApproveMinGrade: autoApproveConfig.minGrade,
      maxWaitingRuns: MAX_WAITING_RUNS,
      selfHealCooldownMinutes: Math.round(SELF_HEAL_COOLDOWN_MS / 60000)
    },
    queue: { waiting, running, notStarted },
    selfHeal: {
      standardsVersion: preview.standardsVersion,
      staleCount: preview.staleCount,
      counts: preview.counts,
      byStatus: preview.byStatus
    }
  };
}

// One entry per item enriched before the current standards (house exclusion/style rules) version.
// Standards are global, so unlike the spec-contract sweep there is no per-subcategory contract to resolve.
export interface StandardsSweepPlanEntry {
  artikelNummer: string;
  fromVersion: number | null;
  toVersion: number;
}

// Pure (no DB/LLM): which settled items predate the current standards version. Observation only — there
// is no acting standards sweep yet (the re-word is step 3, operator-gated), so this just surfaces the
// backlog a re-word would touch. A null stored version (enriched before stamping existed) counts as stale.
export function planStandardsSweep(
  candidates: Array<{ Artikel_Nummer: string; StandardsVersion: number | null }>,
  currentStandardsVersion: number | null
): StandardsSweepPlanEntry[] {
  if (currentStandardsVersion == null) return []; // no standards contract → nothing to be stale against
  const plan: StandardsSweepPlanEntry[] = [];
  for (const candidate of candidates) {
    const stored = typeof candidate.StandardsVersion === 'number' ? candidate.StandardsVersion : null;
    if (stored != null && stored >= currentStandardsVersion) continue; // already current → skip
    plan.push({ artikelNummer: candidate.Artikel_Nummer, fromVersion: stored, toVersion: currentStandardsVersion });
  }
  return plan;
}

// Dry run: how many settled items predate the current standards version. Read-only — no reprocessing;
// the acting re-word stays gated until the operator opts in.
export async function previewStandardsSweep(limit = 20): Promise<StandardsSweepPlanEntry[]> {
  const candidates = await listContractAuditCandidates(limit);
  return planStandardsSweep(candidates, getStandardsContract()?.version ?? null);
}

type SelfHealCandidate = Awaited<ReturnType<typeof listContractAuditCandidates>>[number];
const SELF_HEAL_PAGE_SIZE = 50;
const SELF_HEAL_MAX_PAGES = 20;

// Candidates the self-heal sweep can actually act on: rows in a subcategory with a resolvable spec contract
// that are stale on either axis, oldest first. The staleness filter runs in SQL before the LIMIT.
async function loadStaleSelfHealCandidates(
  statuses: readonly string[],
  limit: number,
  offset: number,
  standardsVersion: number | null
): Promise<SelfHealCandidate[]> {
  const subcategories = await listContractAuditSubcategories(statuses);
  const contractVersions: Array<{ subCategory: number; version: number }> = [];
  for (const subCategory of subcategories) {
    const contract = getSpecContract(subCategory);
    if (contract) contractVersions.push({ subCategory, version: contract.version });
  }
  if (contractVersions.length === 0) return [];
  return listContractAuditCandidates(limit, statuses, { contractVersions, standardsVersion, offset });
}

// Deterministic idle sweeper for the AUTO_REWORK feature (gated, default off). Finds the oldest settled
// item that is stale on either axis — spec contract (SpecContractVersion) or standards (StandardsVersion)
// — and takes the cheapest correct action per `decideSelfHealAction`: re-stamp, a targeted rework
// (extraction), or a search-free re-word/rerun (wording re-applies the house rules). No LLM in the
// decision — pure version + gap check; one enqueue per idle tick keeps it gentle.
async function sweepContractRework(
  deps: AgenticServiceDependencies,
  logger: AgenticServiceLogger
): Promise<SelfHealSweepResult> {
  // Which run states the sweep may touch: AUTO_REWORK covers the settled approved states; AUTO_REVIEW adds
  // the manual-review queue (re-judged only when version-stale, per planSelfHealSweep). Either flag alone
  // is enough to run the sweep (the call site gates on their OR).
  const statuses: string[] = [];
  if (autoReworkConfig.enabled) statuses.push(AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_AUTO_APPROVED);
  if (autoReviewConfig.enabled) statuses.push(AGENTIC_RUN_STATUS_REVIEW);
  if (statuses.length === 0) return { ran: false, reason: 'no-flags-enabled', staleCount: 0, acted: 'none' };

  const standardsCurrent = getStandardsContract()?.version ?? null;
  let candidates: SelfHealCandidate[] = [];
  let plan: ContractSweepPlanEntry[] = [];
  try {
    // Page through the stale pre-filtered rows until one yields a plan: a stale review item that only
    // needs a restamp is (deliberately) dropped by the planner and never touched, so a page full of those
    // would otherwise block the sweep the same way the old fixed window did.
    for (let page = 0; page < SELF_HEAL_MAX_PAGES; page += 1) {
      candidates = await loadStaleSelfHealCandidates(statuses, SELF_HEAL_PAGE_SIZE, page * SELF_HEAL_PAGE_SIZE, standardsCurrent);
      plan = planSelfHealSweep(candidates, getSpecContract, standardsCurrent);
      if (plan.length > 0 || candidates.length < SELF_HEAL_PAGE_SIZE) break;
    }
  } catch (err) {
    logger.error?.('[agentic-service] Self-heal sweep failed to load candidates', { error: toErrorMessage(err) });
    return { ran: false, reason: 'candidate-load-failed', staleCount: 0, acted: 'none' };
  }
  if (plan.length === 0) return { ran: true, reason: 'nothing-stale', staleCount: 0, acted: 'none' };
  // Legibility: log the whole stale backlog across both axes, not just the item we touch this tick, so the
  // sweep's behaviour is observable even though it acts gently (at most one enqueue per idle tick).
  logger.info?.('[agentic-service] Self-heal sweep plan', {
    stale: plan.length,
    rework: plan.filter((p) => p.action === 'rework').length,
    restamp: plan.filter((p) => p.action === 'restamp').length,
    reword: plan.filter((p) => p.action === 'reword').length,
    rerun: plan.filter((p) => p.action === 'rerun').length
  });

  // Automated origin, so its activity-log entries are distinguishable from operator actions.
  const AUTO_ACTOR = 'auto-rework';
  const logSweepEvent = async (artikelNummer: string, event: string, meta: Record<string, unknown>): Promise<void> => {
    try {
      await deps.logEvent({ Actor: AUTO_ACTOR, EntityType: 'Item', EntityId: artikelNummer, Event: event, Meta: JSON.stringify(meta) });
    } catch (err) {
      // Event logging is non-fatal — the sweep action already happened; a logging failure must not undo it.
      logger.warn?.('[agentic-service] Contract-audit failed to log event', { artikelNummer, event, error: toErrorMessage(err) });
    }
  };

  // Respect the waiting-queue cap. The keep-busy feeder runs BEFORE the sweep and tops up the waiting
  // queue with new items up to MAX_WAITING_RUNS, so self-heal only fills whatever slot is still free — it
  // keeps the pipeline busy without flooding it (the operator's "keep busy, don't throw everything in").
  // Restamps don't consume a queue slot, so they always proceed.
  let canEnqueue = true;
  try {
    canEnqueue = (await fetchStatusCount(AGENTIC_RUN_STATUS_QUEUED)) < MAX_WAITING_RUNS;
  } catch {
    canEnqueue = true; // a count failure must not permanently block self-heal
  }

  let restamped = 0;
  for (const entry of plan) {
    if (entry.action === 'rework') {
      if (!canEnqueue) continue; // waiting queue full → leave it for a later tick (restamps still run)
      const lastHeal = selfHealEnqueuedAt.get(entry.artikelNummer);
      if (lastHeal && Date.now() - lastHeal < SELF_HEAL_COOLDOWN_MS) continue; // cooldown: don't re-loop this item
      // Enqueue a targeted rework; the completed run stamps the new contract version so this item is
      // not re-selected (self-limiting). One enqueue per idle tick keeps the sweep gentle.
      selfHealEnqueuedAt.set(entry.artikelNummer, Date.now());
      pendingRework.set(entry.artikelNummer, { fields: entry.fields ?? [], instructions: null });
      const nowIso = resolveNow(deps).toISOString();
      const candidate = candidates.find((c) => c.Artikel_Nummer === entry.artikelNummer);
      try {
        await deps.updateAgenticRunStatus(normalizeAgenticStatusUpdate({
          Artikel_Nummer: entry.artikelNummer,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          SearchQuery: candidate?.Artikelbeschreibung ?? entry.artikelNummer,
          LastModified: nowIso,
          ReviewState: 'not_required',
          ReviewedBy: null,
          ReviewedByIsSet: true,
          RetryCount: 0,
          RetryCountIsSet: true,
          NextRetryAt: null,
          NextRetryAtIsSet: true,
          LastError: null,
          LastErrorIsSet: true,
          LastAttemptAt: null,
          LastAttemptAtIsSet: true
        }));
        logger.info?.('[agentic-service] Contract-audit enqueued rework', {
          artikelNummer: entry.artikelNummer,
          missingRequired: entry.fields,
          fromVersion: entry.fromVersion,
          toVersion: entry.toVersion
        });
        await logSweepEvent(entry.artikelNummer, 'ContractAuditRework', {
          missingRequired: entry.fields,
          fromVersion: entry.fromVersion,
          toVersion: entry.toVersion
        });
      } catch (err) {
        pendingRework.delete(entry.artikelNummer);
        logger.error?.('[agentic-service] Contract-audit failed to enqueue rework', {
          artikelNummer: entry.artikelNummer,
          error: toErrorMessage(err)
        });
        return { ran: true, staleCount: plan.length, acted: 'none', reason: 'enqueue-failed', artikelNummer: entry.artikelNummer };
      }
      return { ran: true, staleCount: plan.length, acted: 'rework', artikelNummer: entry.artikelNummer }; // one enqueue per tick
    }

    if (entry.action === 'reword' || entry.action === 'rerun') {
      if (!canEnqueue) continue; // waiting queue full → leave it for a later tick
      const lastHeal = selfHealEnqueuedAt.get(entry.artikelNummer);
      if (lastHeal && Date.now() - lastHeal < SELF_HEAL_COOLDOWN_MS) continue; // cooldown: don't re-loop this item
      selfHealEnqueuedAt.set(entry.artikelNummer, Date.now());
      // Standards-driven self-heal: enqueue a SEARCH-FREE run (skipSearch, no reworkSpecFields) so the
      // wording stage runs and re-applies the current house rules to stored content. 'rerun' is the same
      // run chosen because the contract also needs extraction (a targeted rework would skip wording).
      // Supervised like any run; the completed run stamps both versions, so the item self-limits. We use
      // skipSearch — never a fresh web search — because this cleans existing data, not re-researches it.
      pendingSkipSearch.add(entry.artikelNummer);
      const nowIso = resolveNow(deps).toISOString();
      const candidate = candidates.find((c) => c.Artikel_Nummer === entry.artikelNummer);
      try {
        await deps.updateAgenticRunStatus(normalizeAgenticStatusUpdate({
          Artikel_Nummer: entry.artikelNummer,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          SearchQuery: candidate?.Artikelbeschreibung ?? entry.artikelNummer,
          LastModified: nowIso,
          ReviewState: 'not_required',
          ReviewedBy: null,
          ReviewedByIsSet: true,
          RetryCount: 0,
          RetryCountIsSet: true,
          NextRetryAt: null,
          NextRetryAtIsSet: true,
          LastError: null,
          LastErrorIsSet: true,
          LastAttemptAt: null,
          LastAttemptAtIsSet: true
        }));
        // A review-state item re-run here is the pending-review self-heal (AUTO_REVIEW): the pipeline
        // re-judges it, so it either auto-approves (queue shrinks) or stays in review. Logged distinctly.
        const fromReview = entry.status === AGENTIC_RUN_STATUS_REVIEW;
        logger.info?.(fromReview
          ? '[agentic-service] Self-heal re-judging a pending-review item'
          : '[agentic-service] Self-heal enqueued standards re-word', {
          artikelNummer: entry.artikelNummer,
          mode: entry.action,
          status: entry.status ?? null,
          fields: entry.fields ?? null,
          standardsFromVersion: entry.standardsFromVersion ?? null,
          standardsToVersion: entry.standardsToVersion ?? null
        });
        await logSweepEvent(entry.artikelNummer, fromReview ? 'PendingReviewSelfHeal' : 'StandardsAuditReword', {
          mode: entry.action,
          status: entry.status ?? null,
          standardsFromVersion: entry.standardsFromVersion ?? null,
          standardsToVersion: entry.standardsToVersion ?? null
        });
      } catch (err) {
        pendingSkipSearch.delete(entry.artikelNummer);
        logger.error?.('[agentic-service] Self-heal failed to enqueue re-word', {
          artikelNummer: entry.artikelNummer,
          error: toErrorMessage(err)
        });
        return { ran: true, staleCount: plan.length, acted: 'none', reason: 'enqueue-failed', artikelNummer: entry.artikelNummer };
      }
      return { ran: true, staleCount: plan.length, acted: entry.action, artikelNummer: entry.artikelNummer }; // one enqueue per tick
    }

    // Stale but already complete under the new contract → cheap re-stamp, no rerun.
    try {
      await stampAgenticRunContractVersion(entry.artikelNummer, entry.toVersion);
      restamped += 1;
      await logSweepEvent(entry.artikelNummer, 'ContractAuditRestamp', {
        fromVersion: entry.fromVersion,
        toVersion: entry.toVersion
      });
    } catch (err) {
      logger.warn?.('[agentic-service] Contract-audit failed to re-stamp item', {
        artikelNummer: entry.artikelNummer,
        error: toErrorMessage(err)
      });
    }
  }
  // Loop completed without hitting an enqueue branch → every entry was a (cheap, batched) restamp.
  return { ran: true, staleCount: plan.length, acted: restamped > 0 ? 'restamp' : 'none', restamped };
}

// Result of one self-heal sweep pass — returned so the admin "run now" can report what actually happened
// (enqueued a rework/reword/rerun on item X, restamped N, or nothing stale) instead of leaving the
// operator guessing whether the tick fired.
export interface SelfHealSweepResult {
  ran: boolean;
  reason?: string;
  staleCount: number;
  acted: 'none' | 'rework' | 'reword' | 'rerun' | 'restamp';
  artikelNummer?: string;
  restamped?: number;
}

// The last dependencies the dispatcher was invoked with — captured so the admin "run now" endpoint can
// drive one sweep pass directly (synchronously), reusing the exact same wiring the interval uses, without
// the action layer having to assemble its own DB dependencies. Set on the first dispatch tick.
let lastDispatchDeps: AgenticServiceDependencies | null = null;

// Run one self-heal sweep pass NOW and return what it did. Bypasses the dispatcher's idle gate entirely,
// so the admin "Jetzt ausführen" button gives immediate, unambiguous feedback. Runs up to `maxActions`
// enqueues in a batch (each re-queries candidates, so it advances through the backlog) so a single click
// makes visible progress rather than one item. Restamps are batched within a single pass already.
export async function runSelfHealSweepNow(maxActions = 5): Promise<{ passes: SelfHealSweepResult[]; warmedUp: boolean }> {
  if (!lastDispatchDeps) {
    return { passes: [], warmedUp: false };
  }
  const logger = resolveLogger(lastDispatchDeps);
  const passes: SelfHealSweepResult[] = [];
  for (let i = 0; i < Math.max(1, maxActions); i += 1) {
    const result = await sweepContractRework(lastDispatchDeps, logger);
    passes.push(result);
    // Stop once a pass enqueued nothing actionable (nothing stale, flags off, or only restamps left —
    // restamps are already all done in that one pass).
    if (result.acted === 'none' || result.acted === 'restamp') break;
  }
  return { passes, warmedUp: true };
}

function validateDependencies(deps: AgenticServiceDependencies): void {
  if (
    !deps?.getAgenticRun ||
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

  const searchQuery = (input.searchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] startAgenticRun missing search query', {
      artikelNummer,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-search-query' };
  }

  if (!await hasAgenticReference(artikelNummer, deps, logger, input.context ?? null, 'startAgenticRun')) {
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-reference', logger);
    return { agentic: null, queued: false, created: false, reason: 'missing-reference' };
  }

  const review = normalizeReviewMetadata(input.review ?? null, null, logger);
  try {
    recordRequestLogStart(request, searchQuery, logger);

    // Atomically check for an existing run and create a new one if absent.
    // Using a transaction prevents concurrent requests from both passing the
    // existence check and scheduling duplicate invocations for the same item.
    let agentic: AgenticRun | null = null;
    let alreadyExists = false;

    await withTransaction(async (_client) => {
      const existing = await fetchAgenticRun(artikelNummer, deps, logger);
      if (existing) {
        alreadyExists = true;
        agentic = existing;
        return;
      }
      agentic = await persistQueuedRun(
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
    });

    if (alreadyExists) {
      logger.info?.('[agentic-service] Skipping agentic run creation because canonical run already exists', {
        artikelNummer,
        context: input.context ?? null
      });
      finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'already-exists', logger);
      return { agentic, queued: false, created: false, reason: 'already-exists' };
    }

    recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
      searchQuery,
      logger
    });

    if (input.imageData && typeof input.imageData === 'string') {
      pendingOcrImageData.set(artikelNummer, input.imageData);
    }

    if (input.skipSearch) {
      pendingSkipSearch.add(artikelNummer);
    }
    if (input.validateOnly) {
      pendingValidateOnly.add(artikelNummer);
    }

    if (Array.isArray(input.reworkSpecFields) && input.reworkSpecFields.length > 0) {
      pendingRework.set(artikelNummer, {
        fields: input.reworkSpecFields,
        instructions: typeof input.reworkInstructions === 'string' ? input.reworkInstructions : null
      });
    }

    // Run is now queued. The background dispatcher (dispatchQueuedAgenticRuns,
    // called on a fixed interval) will pick it up and transition it to running
    // while respecting the MAX_CONCURRENT_RUNNING_RUNS limit.
    logger.info?.('[agentic-service] Agentic run queued; dispatcher will schedule execution', {
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

  const existing = await fetchAgenticRun(artikelNummer, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] cancelAgenticRun attempted without existing run', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-found', logger);
    return { cancelled: false, agentic: null, reason: 'not-found' };
  }

  const nowIso = resolveNow(deps).toISOString();
  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);

  try {
    await withTransaction(async (_client) => {
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

      const updateResult = await deps.updateAgenticRunStatus(
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
      if (!updateResult) {
        throw new Error('Failed to cancel agentic run');
      }

      try {
        await deps.logEvent({
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

  const refreshed = await fetchAgenticRun(artikelNummer, deps, logger);
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

  const existing = await fetchAgenticRun(artikelNummer, deps, logger);
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

  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);

  try {
    await withTransaction(async (client) => {
      const deleteResult = await client.query(
        'DELETE FROM agentic_runs WHERE "Artikel_Nummer" = $1',
        [artikelNummer]
      );
      if (!deleteResult?.rowCount) {
        throw new Error('Failed to delete agentic run');
      }

      await deps.upsertAgenticRun({
        Artikel_Nummer: artikelNummer,
        // Clear SearchQuery/LastSearchLinksJson: a reset run that keeps a SearchQuery is
        // immediately re-promoted by the idle-fill dispatcher, so the deletion never sticks.
        SearchQuery: null,
        Status: AGENTIC_RUN_STATUS_NOT_STARTED,
        LastModified: nowIso,
        ReviewState: 'not_required',
        ReviewedBy: null,
        LastReviewDecision: null,
        LastReviewNotes: null,
        LastSearchLinksJson: null
      });

      try {
        await deps.logEvent({
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
    finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to delete agentic run', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = await fetchAgenticRun(artikelNummer, deps, logger);
  return { deleted: true, agentic: refreshed };
}

type StoredSearchSource = { url: string; title?: string; description?: string };

// Parse the stored LastSearchLinksJson blob into the canonical {url,title?,description?} shape.
// Mirrors the defensive parsing in the frontend (parseAgenticSearchSources) and the result-handler
// (normalizeSearchLinks): a malformed blob degrades to an empty list rather than throwing, so a bad
// blob can't wedge the curation endpoint.
function parseStoredSearchSources(json: string | null | undefined): StoredSearchSource[] {
  if (!json || typeof json !== 'string') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const out: StoredSearchSource[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) continue;
    const source: StoredSearchSource = { url };
    if (typeof candidate.title === 'string' && candidate.title.trim()) {
      source.title = candidate.title.trim();
    }
    if (typeof candidate.description === 'string' && candidate.description.trim()) {
      source.description = candidate.description.trim();
    }
    out.push(source);
  }
  return out;
}

/**
 * Remove a single stored search-result link from a run's LastSearchLinksJson so a bad result stops
 * poisoning the reuse/grounding path (skipSearch reads this blob back verbatim). Operator-facing
 * curation from the KI tab (todo #21). Unlike deleteAgenticRun this does NOT reset the run — it prunes
 * one source and leaves the run's status/review state untouched.
 */
export async function removeAgenticSearchLink(
  input: AgenticRunSearchLinkRemoveInput,
  deps: AgenticServiceDependencies
): Promise<AgenticRunSearchLinkRemoveResult> {
  validateDependencies(deps);
  const logger = resolveLogger(deps);
  const request = normalizeRequestContext(input.request ?? null);
  persistRequestPayloadSnapshot(request, logger);

  const itemId = (input.itemId || '').trim();
  if (!itemId) {
    logger.warn?.('[agentic-service] removeAgenticSearchLink missing itemId');
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-item-id', logger);
    return { removed: false, agentic: null, reason: 'missing-item-id' };
  }
  const resolved = resolveAgenticArtikelNummer(itemId, logger);
  if (!resolved.artikelNummer) {
    const reason = resolved.reason ?? 'missing-artikel-nummer';
    logger.warn?.('[agentic-service] removeAgenticSearchLink failed to resolve Artikel_Nummer', { itemId, reason });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, reason, logger);
    return { removed: false, agentic: null, reason };
  }
  const artikelNummer = resolved.artikelNummer;

  const actor = (input.actor || '').trim();
  if (!actor) {
    logger.warn?.('[agentic-service] removeAgenticSearchLink missing actor', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-actor', logger);
    return { removed: false, agentic: null, reason: 'missing-actor' };
  }

  const url = (input.url || '').trim();
  if (!url) {
    logger.warn?.('[agentic-service] removeAgenticSearchLink missing url', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-url', logger);
    return { removed: false, agentic: null, reason: 'missing-url' };
  }

  const existing = await fetchAgenticRun(artikelNummer, deps, logger);
  if (!existing) {
    logger.warn?.('[agentic-service] removeAgenticSearchLink attempted without existing run', { artikelNummer });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'not-found', logger);
    return { removed: false, agentic: null, reason: 'not-found' };
  }

  const sources = parseStoredSearchSources(existing.LastSearchLinksJson);
  const remaining = sources.filter((source) => source.url !== url);
  if (remaining.length === sources.length) {
    logger.info?.('[agentic-service] removeAgenticSearchLink found no matching link', { artikelNummer, url });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'link-not-found', logger);
    return { removed: false, agentic: existing, reason: 'link-not-found', remaining: sources.length };
  }

  // An emptied list persists as null so downstream reuse/grounding treats it as "no evidence" (same as
  // a never-searched run) rather than an empty-array edge case.
  const nextJson = remaining.length > 0 ? JSON.stringify(remaining) : null;
  const nowIso = resolveNow(deps).toISOString();

  recordRequestLogStart(request, existing.SearchQuery ?? null, logger);

  try {
    // updateAgenticRunStatus rewrites Status/LastModified/ReviewState unconditionally, so echo the
    // run's current values back to avoid clobbering them; only LastSearchLinksJson actually changes
    // (its IsSet flag is the only one set true).
    await deps.updateAgenticRunStatus(
      normalizeAgenticStatusUpdate({
        Artikel_Nummer: artikelNummer,
        Status: existing.Status,
        LastModified: nowIso,
        ReviewState: existing.ReviewState ?? 'not_required',
        LastSearchLinksJson: nextJson,
        LastSearchLinksJsonIsSet: true
      })
    );

    try {
      await deps.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: artikelNummer,
        Event: 'AgenticSearchLinkRemoved',
        Meta: JSON.stringify({ url, remaining: remaining.length, removedAt: nowIso })
      });
    } catch (err) {
      // Event logging is non-fatal here: the link is already pruned, so a logging failure must not
      // surface as a request error.
      logger.error?.('[agentic-service] Failed to record search-link removal event', {
        artikelNummer,
        error: toErrorMessage(err)
      });
    }
    finalizeRequestLog(request, REQUEST_STATUS_SUCCESS, null, logger);
  } catch (err) {
    logger.error?.('[agentic-service] Failed to remove agentic search link', {
      artikelNummer,
      url,
      error: toErrorMessage(err)
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = await fetchAgenticRun(artikelNummer, deps, logger);
  return { removed: true, agentic: refreshed, remaining: remaining.length };
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

  const existing = await fetchAgenticRun(artikelNummer, deps, logger);
  const searchQuery = (input.searchQuery || existing?.SearchQuery || '').trim();
  if (!searchQuery) {
    logger.warn?.('[agentic-service] restartAgenticRun missing search query', {
      artikelNummer,
      context: input.context ?? null
    });
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-search-query', logger);
    return { agentic: existing, queued: false, created: !existing, reason: 'missing-search-query' };
  }

  if (!await hasAgenticReference(artikelNummer, deps, logger, input.context ?? null, 'restartAgenticRun')) {
    finalizeRequestLog(request, REQUEST_STATUS_DECLINED, 'missing-reference', logger);
    return { agentic: existing, queued: false, created: false, reason: 'missing-reference' };
  }

  // TODO(agentic-review-restart): Keep explicit review replace semantics aligned with action payload contracts.
  // TODO(agentic-review-lifecycle): Keep restart-time guidance retention aligned with review-stage cleanup behavior.
  const replaceReviewMetadata = input.replaceReviewMetadata === true;
  const hasReviewPayload = input.review != null;
  const review = replaceReviewMetadata
    ? normalizeReviewMetadata(input.review ?? null, null, logger)
    : hasReviewPayload
      ? normalizeReviewMetadata(input.review ?? null, null, logger)
      : normalizeReviewMetadata(null, existing, logger);
  const nowIso = resolveNow(deps).toISOString();
  const actor = input.actor?.trim() || null;
  const context = input.context?.trim() || null;
  const shouldClearReviewMetadata = replaceReviewMetadata && !hasReviewPayload;
  const shouldApplyProvidedReview = !shouldClearReviewMetadata && hasReviewPayload;
  const reviewState = shouldClearReviewMetadata
    ? 'not_required'
    : shouldApplyProvidedReview
      ? review?.state ?? existing?.ReviewState ?? 'not_required'
      : existing?.ReviewState ?? 'not_required';
  const reviewedBy = shouldClearReviewMetadata
    ? null
    : shouldApplyProvidedReview
      ? review?.reviewedBy ?? null
      : existing?.ReviewedBy ?? null;
  const lastReviewDecision = shouldClearReviewMetadata
    ? null
    : shouldApplyProvidedReview
      ? review?.decision ?? null
      : existing?.LastReviewDecision ?? null;
  const lastReviewNotes = shouldClearReviewMetadata
    ? null
    : shouldApplyProvidedReview
      ? review?.notes ?? null
      : existing?.LastReviewNotes ?? null;
  const reviewDecision: RestartReviewDecision = shouldClearReviewMetadata
    ? 'cleared'
    : replaceReviewMetadata
      ? 'replaced'
      : hasReviewPayload
        ? 'merged'
        : 'preserved';
  recordRequestLogStart(request, searchQuery, logger);
  logger.info?.('[agentic-service] Restart review metadata transition', {
    artikelNummer,
    context,
    reviewPreserved: reviewDecision === 'preserved',
    reviewMerged: reviewDecision === 'merged',
    reviewCleared: reviewDecision === 'cleared',
    reason: shouldClearReviewMetadata
      ? 'explicit-replace-without-review'
      : replaceReviewMetadata
        ? 'explicit-replace-with-review'
        : hasReviewPayload
          ? 'review-provided'
          : 'review-omitted',
    previous: toReviewSnapshot(null, existing),
    next: toReviewSnapshot(
      shouldClearReviewMetadata
        ? {
            decision: null,
            information_present: null,
            missing_spec: [],
            unneeded_spec: [],
            bad_format: null,
            wrong_information: null,
            wrong_physical_dimensions: null,
            notes: null,
            reviewedBy: null,
            state: 'not_required'
          }
        : review,
      existing
    )
  });
  try {
    await withTransaction(async (_client) => {
      if (existing) {
        const updateResult = await deps.updateAgenticRunStatus(
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
        if (!updateResult) {
          throw new Error('Failed to reset agentic run');
        }
      } else {
        await deps.upsertAgenticRun({
          Artikel_Nummer: artikelNummer,
          SearchQuery: searchQuery,
          Status: AGENTIC_RUN_STATUS_QUEUED,
          LastModified: nowIso,
          ReviewState: reviewState,
          ReviewedBy: reviewedBy,
          LastReviewDecision: lastReviewDecision,
          LastReviewNotes: lastReviewNotes,
          LastSearchLinksJson: null
        });
      }

      try {
        await deps.logEvent({
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
  } catch (err) {
    logger.error?.('[agentic-service] Failed to restart agentic run', {
      artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    finalizeRequestLog(request, REQUEST_STATUS_FAILED, toErrorMessage(err), logger);
    throw err;
  }

  const refreshed = await fetchAgenticRun(artikelNummer, deps, logger);

  recordAgenticRequestLogUpdate(request, AGENTIC_RUN_STATUS_QUEUED, {
    searchQuery,
    logger
  });

  if (input.imageData && typeof input.imageData === 'string') {
    pendingOcrImageData.set(artikelNummer, input.imageData);
  }

  if (input.skipSearch) {
    pendingSkipSearch.add(artikelNummer);
  }
  if (input.validateOnly) {
    pendingValidateOnly.add(artikelNummer);
  }

  if (Array.isArray(input.reworkSpecFields) && input.reworkSpecFields.length > 0) {
    pendingRework.set(artikelNummer, {
      fields: input.reworkSpecFields,
      instructions: typeof input.reworkInstructions === 'string' ? input.reworkInstructions : null
    });
  }

  // Run is now queued. The background dispatcher will pick it up and
  // transition it to running while respecting the concurrency limit.
  logger.info?.('[agentic-service] Agentic run restart queued; dispatcher will schedule execution', {
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
    } catch (error) {
      console.warn('[agentic-service] Failed to parse review history metadata; using empty spec arrays', {
        missingSpecCount: 0,
        unneededSpecCount: 0,
        error: toErrorMessage(error)
      });
      parsedMetadata = {};
    }

    return {
      decision: entry.ReviewDecision ?? null,
      information_present: normalizeNullableBoolean(parsedMetadata.information_present),
      missing_spec: normalizeSpecList(parsedMetadata.missing_spec),
      unneeded_spec: normalizeSpecList(parsedMetadata.unneeded_spec),
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
    unneeded_spec: [],
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
    staleRuns = await query<AgenticRun>(SELECT_STALE_AGENTIC_RUNS_SQL, []);
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

  // Running runs (server died mid-run) already hold their slot, so no cap check here.
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
        reviewHistory = await listAgenticRunReviewHistory(run.Artikel_Nummer);
      } catch (historyErr) {
        logger.warn?.('[agentic-service] Failed to load review history during stale run resume', {
          artikelNummer: run.Artikel_Nummer,
          error: toErrorMessage(historyErr)
        });
      }

      void scheduleAgenticModelInvocation({
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

export async function getAgenticStatus(
  itemId: string,
  deps: AgenticServiceDependencies
): Promise<AgenticRunStatusResult> {
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

  const run = await fetchAgenticRun(resolved.artikelNummer, deps, logger);
  if (!run) {
    return { agentic: null };
  }
  // Attach the transient on-read review signals (findings + data-quality grade) via the shared helper so
  // this read and the item-detail read surface them identically. Best-effort: a failure never blocks.
  try {
    const ref = await deps.getItemReference(resolved.artikelNummer);
    return { agentic: attachCurrentReviewSignals(run, ref as Record<string, unknown> | null) };
  } catch (err) {
    logger.warn?.('[agentic-service] Failed to compute current review signals', {
      artikelNummer: resolved.artikelNummer,
      error: err instanceof Error ? err.message : err
    });
    return { agentic: { ...run, CurrentFindings: [], CurrentDataQuality: null } };
  }
}

export async function checkAgenticHealth(
  deps: AgenticServiceDependencies,
  options: AgenticHealthOptions = {}
): Promise<AgenticHealthStatus> {
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
    const rows = await query<{ status: string; count: number; lastModified: string | null }>(
      `SELECT "Status" as status, COUNT(*) as count, MAX("LastModified") as "lastModified"
         FROM agentic_runs
        GROUP BY "Status"`,
      []
    );
    let queuedRuns = 0;
    let runningRuns = 0;
    let lastUpdatedAt: string | null = null;

    for (const row of rows) {
      if (row.status === AGENTIC_RUN_STATUS_QUEUED) {
        queuedRuns += Number(row.count ?? 0);
      }
      if (row.status === AGENTIC_RUN_STATUS_RUNNING) {
        runningRuns += Number(row.count ?? 0);
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
