import React from 'react';
import type { Finding, FindingSeverity } from '../../../models/agentic-findings';

// Severity presentation for findings — inline so the panel is legible without a stylesheet dependency.
const SEVERITY_LABEL: Record<FindingSeverity, string> = { block: 'Pflicht', warn: 'Prüfen', info: 'Hinweis' };
const SEVERITY_STYLE: Record<FindingSeverity, React.CSSProperties> = {
  block: { background: '#fdecea', color: '#a4262c' },
  warn: { background: '#fff4e5', color: '#8a5300' },
  info: { background: '#eef1f5', color: '#4a5568' }
};

// Review-by-exception: the "Zu prüfen" panel listing machine-surfaced findings for a run. Shared by the
// review wizard (transient) and the KI tab (persistent), so findings are visible wherever a run has them.
// Renders nothing when there are no findings.
export function FindingsPanel({ findings, title = 'Zu prüfen' }: { findings: Finding[]; title?: string }) {
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
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FindingsPanel;
