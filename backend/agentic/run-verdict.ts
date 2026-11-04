import type { Finding } from '../../models/agentic-findings';
import type { DataQualityGrade } from '../../models/data-quality';
import {
  normalizeAgenticRunStatus,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_AUTO_APPROVED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  type AgenticRunStatus
} from '../../models/agentic-statuses';

// One-line, human-facing verdict for a run's CURRENT state. Composed DETERMINISTICALLY from the same
// on-read signals the review surfaces already use (status + findings + data-quality grade) — no LLM, no
// extra call. The point is to collapse the cluttered diff/findings list into a single scannable sentence
// ("what happened / what the state is"); the detail (diff, findings panel) stays available for a closer
// look. Reused by the KI-tab header AND the pending-review sweep (to log/explain why an item was cleared
// or kept), so the verdict a human reads and the one the machine logs can never drift apart.

const STATUS_PREFIX: Record<AgenticRunStatus, string> = {
  [AGENTIC_RUN_STATUS_QUEUED]: 'Eingereiht',
  [AGENTIC_RUN_STATUS_RUNNING]: 'Läuft',
  [AGENTIC_RUN_STATUS_REVIEW]: 'Review nötig',
  [AGENTIC_RUN_STATUS_APPROVED]: 'Freigegeben',
  [AGENTIC_RUN_STATUS_AUTO_APPROVED]: 'Auto-freigegeben',
  [AGENTIC_RUN_STATUS_REJECTED]: 'Abgelehnt',
  [AGENTIC_RUN_STATUS_FAILED]: 'Fehlgeschlagen',
  [AGENTIC_RUN_STATUS_CANCELLED]: 'Abgebrochen',
  [AGENTIC_RUN_STATUS_NOT_STARTED]: 'Noch kein KI-Lauf'
};

// States whose verdict is a judgement ON THE CONTENT — only these get the grade + findings clauses. The
// rest (queued/running/failed/cancelled/notStarted) are lifecycle states, not content verdicts, so the
// prefix alone is the honest thing to say.
const CONTENT_STATES: ReadonlySet<AgenticRunStatus> = new Set([
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_AUTO_APPROVED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_REJECTED
]);

const MAX_FIELD_NAMES = 3; // keep the one-liner short — list a few field names, then "…"

export interface RunVerdictInput {
  status?: string | null;
  findings: Finding[];
  dataQuality: DataQualityGrade | null;
}

function fieldList(fields: string[]): string {
  if (fields.length <= MAX_FIELD_NAMES) return fields.join(', ');
  return `${fields.slice(0, MAX_FIELD_NAMES).join(', ')} …`;
}

// The findings clause: missing required fields dominate (most actionable, so name them); other
// block/warn findings are counted as "Beanstandungen"; info-only findings don't make it a problem.
function findingsClause(findings: Finding[]): string {
  const missing = findings
    .filter((f) => f.type === 'missing_required')
    .map((f) => f.field)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  const complaints = findings.filter((f) => f.type !== 'missing_required' && (f.severity === 'block' || f.severity === 'warn')).length;

  const parts: string[] = [];
  if (missing.length === 1) parts.push(`1 Pflichtfeld fehlt (${fieldList(missing)})`);
  else if (missing.length > 1) parts.push(`${missing.length} Pflichtfelder fehlen (${fieldList(missing)})`);
  if (complaints > 0) parts.push(`${complaints} Beanstandung${complaints === 1 ? '' : 'en'}`);

  if (parts.length === 0) return 'keine offenen Punkte';
  return parts.join(', ');
}

export function composeRunVerdict(input: RunVerdictInput): string {
  const status = normalizeAgenticRunStatus(input.status);
  const prefix = STATUS_PREFIX[status];
  if (!CONTENT_STATES.has(status)) return prefix; // lifecycle state → prefix only

  const parts: string[] = [prefix];
  if (input.dataQuality && typeof input.dataQuality.grade === 'number') {
    const label = input.dataQuality.label ? ` (${input.dataQuality.label})` : '';
    parts.push(`Datenqualität ${input.dataQuality.grade}/5${label}`);
  }
  parts.push(findingsClause(input.findings));
  return parts.join(' · ');
}
