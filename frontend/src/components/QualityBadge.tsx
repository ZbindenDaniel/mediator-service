// TODO(quality-ui): Align badge styling with future design tokens once shared badges are available.
// TODO(agent): Confirm neutral styling for unknown quality values once the design system lands.
import React from 'react';
import { describeQuality, QUALITY_COLOR_MAP, QUALITY_UNKNOWN_COLOR } from '../../../models/quality';

const QUALITY_COLOR_HEX: Record<(typeof QUALITY_COLOR_MAP)[number] | typeof QUALITY_UNKNOWN_COLOR, string> = {
  purple: '#6f42c1',
  red: '#d73a49',
  yellow: '#e3b341',
  orange: '#fb8c00',
  green: '#2da44e',
  gray: '#94a3b8'
};

interface Props {
  value?: number | null;
  compact?: boolean;
  labelPrefix?: string;
}

export default function QualityBadge({ value, compact, labelPrefix = '' }: Props) {
  const isUnknown = value === null || value === undefined || Number.isNaN(value);
  const quality = isUnknown ? null : describeQuality(value);
  const backgroundColor = isUnknown ? '#94a3b8' : QUALITY_COLOR_HEX[quality?.color ?? 'yellow'];
  const textColor = isUnknown ? '#0f172a' : quality?.color === 'yellow' ? '#0f172a' : '#ffffff';
  const className = compact ? 'quality-badge quality-badge--compact' : 'quality-badge';
  const prefix = labelPrefix ? `${labelPrefix}: ` : '';
  const ariaLabel = isUnknown ? `${prefix}?` : `${prefix}${quality?.label ?? ''} (${quality?.value ?? ''})`;

  return (
    <span
      aria-label={ariaLabel}
      className={className}
      style={{ backgroundColor, color: textColor }}
    >
      <span className="quality-badge__label">{isUnknown ? '?' : quality?.value ?? '?'}</span>
    </span>
  );
}
