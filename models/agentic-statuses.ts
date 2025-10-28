export const AGENTIC_RUN_STATUS_QUEUED = 'queued' as const;
export const AGENTIC_RUN_STATUS_RUNNING = 'running' as const;
export const AGENTIC_RUN_STATUS_REVIEW = 'review' as const;
export const AGENTIC_RUN_STATUS_APPROVED = 'approved' as const;
export const AGENTIC_RUN_STATUS_REJECTED = 'rejected' as const;
export const AGENTIC_RUN_STATUS_FAILED = 'failed' as const;
export const AGENTIC_RUN_STATUS_CANCELLED = 'cancelled' as const;
export const AGENTIC_RUN_STATUS_NOT_STARTED = 'notStarted' as const;

export const AGENTIC_RUN_STATUSES = [
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_NOT_STARTED
] as const;

export type AgenticRunStatus = (typeof AGENTIC_RUN_STATUSES)[number];

const STATUS_NORMALIZATION_MAP = new Map<string, AgenticRunStatus>([
  [AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_QUEUED],
  ['queue', AGENTIC_RUN_STATUS_QUEUED],
  ['queued', AGENTIC_RUN_STATUS_QUEUED],
  ['pending', AGENTIC_RUN_STATUS_QUEUED],
  ['waiting', AGENTIC_RUN_STATUS_QUEUED],
  ['scheduled', AGENTIC_RUN_STATUS_QUEUED],
  ['created', AGENTIC_RUN_STATUS_QUEUED],
  [AGENTIC_RUN_STATUS_RUNNING, AGENTIC_RUN_STATUS_RUNNING],
  ['in_progress', AGENTIC_RUN_STATUS_RUNNING],
  ['processing', AGENTIC_RUN_STATUS_RUNNING],
  ['executing', AGENTIC_RUN_STATUS_RUNNING],
  ['active', AGENTIC_RUN_STATUS_RUNNING],
  [AGENTIC_RUN_STATUS_REVIEW, AGENTIC_RUN_STATUS_REVIEW],
  ['pending_review', AGENTIC_RUN_STATUS_REVIEW],
  ['awaiting_review', AGENTIC_RUN_STATUS_REVIEW],
  ['needs_review', AGENTIC_RUN_STATUS_REVIEW],
  ['review_pending', AGENTIC_RUN_STATUS_REVIEW],
  ['awaiting_approval', AGENTIC_RUN_STATUS_REVIEW],
  ['ready_for_review', AGENTIC_RUN_STATUS_REVIEW],
  ['requires_review', AGENTIC_RUN_STATUS_REVIEW],
  ['waiting_for_review', AGENTIC_RUN_STATUS_REVIEW],
  [AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_APPROVED],
  ['accepted', AGENTIC_RUN_STATUS_APPROVED],
  ['published', AGENTIC_RUN_STATUS_APPROVED],
  ['done', AGENTIC_RUN_STATUS_APPROVED],
  ['completed', AGENTIC_RUN_STATUS_APPROVED],
  ['success', AGENTIC_RUN_STATUS_APPROVED],
  ['succeeded', AGENTIC_RUN_STATUS_APPROVED],
  ['finished', AGENTIC_RUN_STATUS_APPROVED],
  ['resolved', AGENTIC_RUN_STATUS_APPROVED],
  ['released', AGENTIC_RUN_STATUS_APPROVED],
  [AGENTIC_RUN_STATUS_REJECTED, AGENTIC_RUN_STATUS_REJECTED],
  ['declined', AGENTIC_RUN_STATUS_REJECTED],
  ['denied', AGENTIC_RUN_STATUS_REJECTED],
  [AGENTIC_RUN_STATUS_FAILED, AGENTIC_RUN_STATUS_FAILED],
  ['error', AGENTIC_RUN_STATUS_FAILED],
  ['errored', AGENTIC_RUN_STATUS_FAILED],
  ['failure', AGENTIC_RUN_STATUS_FAILED],
  ['timeout', AGENTIC_RUN_STATUS_FAILED],
  ['timed_out', AGENTIC_RUN_STATUS_FAILED],
  [AGENTIC_RUN_STATUS_CANCELLED, AGENTIC_RUN_STATUS_CANCELLED],
  ['canceled', AGENTIC_RUN_STATUS_CANCELLED],
  ['aborted', AGENTIC_RUN_STATUS_CANCELLED],
  ['stopped', AGENTIC_RUN_STATUS_CANCELLED],
  ['terminated', AGENTIC_RUN_STATUS_CANCELLED],
  [AGENTIC_RUN_STATUS_NOT_STARTED.toLowerCase(), AGENTIC_RUN_STATUS_NOT_STARTED],
  ['not_started', AGENTIC_RUN_STATUS_NOT_STARTED]
]);

export function isAgenticRunStatus(value: string | null | undefined): value is AgenticRunStatus {
  if (!value) {
    return false;
  }
  return AGENTIC_RUN_STATUSES.includes(value as AgenticRunStatus);
}

export function normalizeAgenticRunStatus(requestedStatus: string | null | undefined): AgenticRunStatus {
  const normalized = (requestedStatus ?? '').trim().toLowerCase();
  if (!normalized) {
    return AGENTIC_RUN_STATUS_QUEUED;
  }

  const resolved = STATUS_NORMALIZATION_MAP.get(normalized);
  if (resolved) {
    return resolved;
  }

  return AGENTIC_RUN_STATUS_QUEUED;
}

export function resolveAgenticRunStatus(requestedStatus: string | null | undefined): AgenticRunStatus {
  return normalizeAgenticRunStatus(requestedStatus);
}

export const AGENTIC_RUN_ACTIVE_STATUSES: ReadonlySet<AgenticRunStatus> = new Set([
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING
]);

export const AGENTIC_RUN_REVIEW_REQUIRED_STATUSES: ReadonlySet<AgenticRunStatus> = new Set([
  AGENTIC_RUN_STATUS_REVIEW
]);

export const AGENTIC_RUN_RESTARTABLE_STATUSES: ReadonlySet<AgenticRunStatus> = new Set([
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_CANCELLED
]);

export const AGENTIC_RUN_TERMINAL_STATUSES: ReadonlySet<AgenticRunStatus> = new Set([
  ...AGENTIC_RUN_RESTARTABLE_STATUSES,
  AGENTIC_RUN_STATUS_NOT_STARTED
]);
