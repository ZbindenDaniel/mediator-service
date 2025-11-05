import type { AgenticRun } from './agentic-run';

export interface AgenticRunReviewMetadata {
  decision: string | null;
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
}

export interface AgenticModelInvocationResult {
  ok: boolean;
  message?: string | null;
}

