import React from 'react';
import type { Finding, FindingSeverity } from '../../../models/agentic-findings';

// Severity presentation for findings — inline so the panel is legible without a stylesheet dependency.
const SEVERITY_LABEL: Record<FindingSeverity, string> = { block: 'Pflicht', warn: 'Prüfen', info: 'Hinweis' };
const SEVERITY_STYLE: Record<FindingSeverity, React.CSSProperties> = {
  block: { background: '#fdecea', color: '#a4262c' },
  warn: { background: '#fff4e5', color: '#8a5300' },
  info: { background: '#eef1f5', color: '#4a5568' }
};

interface FindingsPanelProps {
  findings: Finding[];
  title?: string;
  // Lever L5a: when provided, a finding the machine can resolve by regenerating its field (ask === 'fix'
  // with a field) gets a "Beheben" button that calls this. Omitted → the panel stays read-only (the
  // review wizard still passes nothing). `busy` disables the buttons while a rework is in flight.
  onFix?: (finding: Finding) => void;
  busy?: boolean;
}

// A finding is one-click fixable when regenerating its single field resolves it: banned phrases and
// missing-required fields (ask === 'fix'). `choose` conflicts (A/B) need a value, not a regenerate, and
// are handled by a later slice, so they show no button here.
function isFixable(finding: Finding): boolean {
  return finding.ask === 'fix' && typeof finding.field === 'string' && finding.field.trim().length > 0;
}

// Review-by-exception: the "Zu prüfen" panel listing machine-surfaced findings for a run. Shared by the
// review wizard (transient) and the KI tab (persistent), so findings are visible wherever a run has them.
// Renders nothing when there are no findings.
export function FindingsPanel({ findings, title = 'Zu prüfen', onFix, busy = false }: FindingsPanelProps) {
  if (!findings || findings.length === 0) return null;
  return (
    <div className="review-findings" role="region" aria-label={title}>
      <div className="review-findings__title">{title} ({findings.length})</div>
      <ul className="review-findings__list">
        {findings.map((finding, index) => (
          <li key={`${finding.field ?? 'item'}-${finding.ruleId ?? finding.type}-${index}`} className="review-findings__item">
            <span className="review-findings__badge" style={SEVERITY_STYLE[finding.severity] ?? SEVERITY_STYLE.warn}>
              {SEVERITY_LABEL[finding.severity] ?? 'Prüfen'}
            </span>
            <div className="review-findings__body">
              {finding.field ? <span className="review-findings__field">{finding.field}</span> : null}
              <span className="review-findings__message">{finding.message}</span>
              {finding.evidence ? <span className="review-findings__evidence muted">„{finding.evidence}“</span> : null}
            </div>
            {onFix && isFixable(finding) ? (
              <button
                type="button"
                className="btn secondary review-findings__fix"
                disabled={busy}
                onClick={() => onFix(finding)}
                title={`Feld „${finding.field}“ gezielt überarbeiten`}
              >
                Beheben
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FindingsPanel;
