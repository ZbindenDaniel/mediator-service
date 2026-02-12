import type { AgenticRun } from './agentic-run';

// TODO(agent): Monitor requestId propagation for model invocations to ensure downstream logging stays consistent.

export interface AgenticRunReviewMetadata {
  decision: string | null;
  action?: string | null;
  // TODO(agentic-review-contract): Keep frontend/backend review signal fields aligned when contract evolves.
  information_present: boolean | null;
  missing_spec: string[];
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
}
