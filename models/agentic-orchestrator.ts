import type { AgenticRun } from './agentic-run';

// TODO(agent): Monitor requestId propagation for model invocations to ensure downstream logging stays consistent.

// TODO(agentic-review-spec-contract): Keep shared review spec limits synchronized across frontend/backend normalization paths.
export const AGENTIC_REVIEW_SPEC_MAX_ENTRIES = 10;
export const AGENTIC_REVIEW_SPEC_MAX_TOKENS_PER_ENTRY = 12;

export interface AgenticRunReviewMetadata {
  decision: string | null;
  action?: string | null;
  // TODO(agentic-review-contract): Keep frontend/backend review signal fields aligned when contract evolves.
  information_present: boolean | null;
  missing_spec: string[];
  // TODO(agentic-review-contract): Keep unneeded_spec normalization aligned with missing_spec caps.
  unneeded_spec: string[];
  bad_format: boolean | null;
  wrong_information: boolean | null;
  wrong_physical_dimensions: boolean | null;
  notes: string | null;
  reviewedBy: string | null;
}

export interface AgenticRequestNotificationMetadata {
  completedAt?: string | null;
  error?: string | null;
}

export interface AgenticRequestContext {
  id: string;
  payload?: unknown;
  notification?: AgenticRequestNotificationMetadata | null;
}

export interface AgenticRunStartInput {
  itemId: string;
  searchQuery?: string | null;
  actor?: string | null;
  review?: AgenticRunReviewMetadata | null;
  context?: string | null;
  request?: AgenticRequestContext | null;
  imageData?: string | null;
  skipSearch?: boolean;
  /**
   * Targeted rework: the spec/field keys to regenerate. When set, the flow runs in "rework mode" —
   * only these keys are accepted from the model's output (all other fields keep their original
   * values), and the categorizer/pricing stages are skipped.
   */
  reworkSpecFields?: string[] | null;
  /** Free-text operator instruction for a rework (e.g. "translate these to German"). */
  reworkInstructions?: string | null;
}

export interface AgenticRunStartResult {
  queued: boolean;
  created: boolean;
  agentic: AgenticRun | null;
  reason?: string | null;
}

export interface AgenticRunCancelInput {
  itemId: string;
  actor: string;
  reason?: string | null;
  request?: AgenticRequestContext | null;
}

export interface AgenticRunCancelResult {
  cancelled: boolean;
  agentic: AgenticRun | null;
  reason?: string | null;
}

export interface AgenticRunDeleteInput {
  itemId: string;
  actor: string;
  reason?: string | null;
  request?: AgenticRequestContext | null;
}

export interface AgenticRunDeleteResult {
  deleted: boolean;
  agentic: AgenticRun | null;
  reason?: string | null;
}

export interface AgenticRunRestartInput extends AgenticRunStartInput {
  previousStatus?: string | null;
  replaceReviewMetadata?: boolean;
}

export interface AgenticRunStatusResult {
  agentic: AgenticRun | null;
}

export interface AgenticHealthStatus {
  ok: boolean;
  message?: string | null;
  queuedRuns: number;
  runningRuns: number;
  lastUpdatedAt?: string | null;
}

export interface AgenticHealthOptions {
  request?: AgenticRequestContext | null;
}

export interface AgenticModelInvocationInput {
  itemId: string;
  searchQuery: string;
  context?: string | null;
  review?: AgenticRunReviewMetadata | null;
  requestId?: string | null;
  imageData?: string | null;
  skipSearch?: boolean;
  reworkSpecFields?: string[] | null;
  reworkInstructions?: string | null;
}

export interface AgenticModelInvocationResult {
  ok: boolean;
  message?: string | null;
}

// TODO(agentic-result-payload): keep result payload contract aligned with Artikel_Nummer-only ingestion.
export interface AgenticResultPayload extends Record<string, unknown> {
  artikelNummer?: string;
  Artikel_Nummer?: string;
  status: string;
  error: string | null;
  needsReview: boolean;
  summary: string;
  reviewDecision: string | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  actor: string;
  item: Record<string, unknown> & { Artikel_Nummer?: string };
  /**
   * True when the flow judged the extraction "clearly good" (supervisor PASS + confidence ≥ threshold
   * + no missing-required + no ambiguous fields). The result handler may finalize such runs as
   * `auto_approved` instead of manual review when AUTO_APPROVE is enabled.
   */
  autoApprovable?: boolean;
  /** Spec contract version this run completed against — stamped on the run for staleness detection. */
  specContractVersion?: number | null;
}
