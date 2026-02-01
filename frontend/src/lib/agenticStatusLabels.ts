import type { AgenticRunStatus } from '../../../models';
import {
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_RUNNING
} from '../../../models';

// TODO(agentic-status-labels): Wire these labels into a centralized i18n layer once available.
// TODO(agentic-status-labels): Keep queued label aligned with ItemDetail copy.
const STATUS_LABELS: Record<AgenticRunStatus, string> = {
  [AGENTIC_RUN_STATUS_APPROVED]: 'Freigegeben',
  [AGENTIC_RUN_STATUS_CANCELLED]: 'Abgebrochen',
  [AGENTIC_RUN_STATUS_FAILED]: 'Fehlgeschlagen',
  [AGENTIC_RUN_STATUS_NOT_STARTED]: 'Nicht gestartet',
  [AGENTIC_RUN_STATUS_QUEUED]: 'Wartet',
  [AGENTIC_RUN_STATUS_REJECTED]: 'Abgelehnt',
  [AGENTIC_RUN_STATUS_REVIEW]: 'Review nötig',
  [AGENTIC_RUN_STATUS_RUNNING]: 'Läuft'
};

export function describeAgenticStatus(status: AgenticRunStatus | null | undefined): string {
  const normalized = status ?? AGENTIC_RUN_STATUS_NOT_STARTED;
  return STATUS_LABELS[normalized] ?? normalized;
}
