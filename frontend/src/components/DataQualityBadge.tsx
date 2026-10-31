import React from 'react';
import type { DataQualityGrade } from '../../../models/data-quality';

// Lever L10 — compact badge for the catalogue DATA-quality grade (how good the *data* is), shown in
// the KI tab next to the "Zu prüfen" findings. Distinct from the condition grade (how good the *device*
// is). Inline styles so it needs no stylesheet, mirroring FindingsPanel. Renders nothing when the item
// has no spec contract (grade === null) — there is then no notion of "complete" to grade.

// Grade → colour, reusing the findings palette's reds/ambers/greens so the two surfaces read as one.
const GRADE_STYLE: Record<number, React.CSSProperties> = {
  5: { background: '#e6f4ea', color: '#1e6b35' },
  4: { background: '#eef6e9', color: '#3f6b1e' },
  3: { background: '#fff4e5', color: '#8a5300' },
  2: { background: '#fdeee3', color: '#9a4a1e' },
  1: { background: '#fdecea', color: '#a4262c' }
};
const NEUTRAL: React.CSSProperties = { background: '#eef1f5', color: '#4a5568' };

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

export function DataQualityBadge({ quality, title = 'Datenqualität' }: { quality: DataQualityGrade | null | undefined; title?: string }) {
  if (!quality) return null;
  const { grade, label, score, capped, components } = quality;
  const style = grade !== null ? GRADE_STYLE[grade] ?? NEUTRAL : NEUTRAL;
  // Tooltip explains the single number so the badge is legible without opening anything.
  const tip = [
    `Konformität ${pct(components.conformance)}`,
    `Vollständigkeit ${pct(components.completeness)}`,
    `Aktualität ${pct(components.freshness)}`,
    capped ? 'Durch einen Pflicht-Befund gedeckelt' : null
  ].filter(Boolean).join(' · ');

  return (
    <div className="data-quality" role="region" aria-label={title} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
      <span className="muted" style={{ fontSize: '0.85em' }}>{title}</span>
      <span
        className="data-quality__badge"
        title={tip}
        style={{ ...style, borderRadius: '999px', padding: '0.1rem 0.6rem', fontWeight: 600, fontSize: '0.85em' }}
      >
        {grade !== null ? `${grade} · ${label ?? ''}`.trim() : '–'} ({pct(score)})
        {capped ? ' ⚠' : ''}
      </span>
    </div>
  );
}

export default DataQualityBadge;
