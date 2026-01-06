// TODO(quality-ui): Align badge styling with future design tokens once shared badges are available.
import React from 'react';
import { describeQuality, QUALITY_COLOR_MAP } from '../../../models/quality';

const QUALITY_COLOR_HEX: Record<(typeof QUALITY_COLOR_MAP)[number], string> = {
  purple: '#6f42c1',
  red: '#d73a49',
  yellow: '#e3b341',
  orange: '#fb8c00',
  green: '#2da44e'
};

interface Props {
  value?: number | null;
  compact?: boolean;
  labelPrefix?: string;
}

export default function QualityBadge({ value, compact, labelPrefix = '' }: Props) {
  const { label, color, value: normalized } = describeQuality(value);
  const backgroundColor = QUALITY_COLOR_HEX[color];
  const textColor = color === 'yellow' ? '#0f172a' : '#ffffff';
  const className = compact ? 'quality-badge quality-badge--compact' : 'quality-badge';

  return (
    <span
      aria-label={`${labelPrefix}: ${label} (${normalized})`}
      className={className}
      style={{ backgroundColor, color: textColor }}
    >
      <span className="quality-badge__label">{normalized}</span>
    </span>
  );
}
