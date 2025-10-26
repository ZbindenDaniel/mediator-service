export const AGENTIC_RUN_STATUS_QUEUED = 'queued' as const;
export const AGENTIC_RUN_STATUS_RUNNING = 'running' as const;
export const AGENTIC_RUN_STATUS_NOT_STARTED = 'notStarted' as const;

export type AgenticRunStatus =
  | typeof AGENTIC_RUN_STATUS_QUEUED
  | typeof AGENTIC_RUN_STATUS_RUNNING
  | typeof AGENTIC_RUN_STATUS_NOT_STARTED;

export function resolveAgenticRunStatus(requestedStatus: string | null | undefined): AgenticRunStatus {
  const normalized = (requestedStatus ?? '').trim().toLowerCase();

  if (normalized === AGENTIC_RUN_STATUS_RUNNING) {
    return AGENTIC_RUN_STATUS_RUNNING;
  }

  if (normalized === AGENTIC_RUN_STATUS_NOT_STARTED.toLowerCase()) {
    return AGENTIC_RUN_STATUS_NOT_STARTED;
  }

  return AGENTIC_RUN_STATUS_QUEUED;
}

// TODO: Expand agentic run statuses once additional workflow phases are introduced.
