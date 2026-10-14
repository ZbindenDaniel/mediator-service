// TODO(quality-ui): Align badge styling with future design tokens once shared badges are available.
// TODO(agent): Confirm neutral styling for unknown quality values once the design system lands.
import React from 'react';
import { describeQuality, QUALITY_COLOR_MAP, QUALITY_UNKNOWN_COLOR } from '../../../models/quality';

// Same hues as before at reduced chroma (OKLCH C ≤ .10, see styles.scss tokens); kept as fixed
// values in both themes because they carry white text, which needs mid lightness either way.
const QUALITY_COLOR_HEX: Record<(typeof QUALITY_COLOR_MAP)[number] | typeof QUALITY_UNKNOWN_COLOR, string> = {
  purple: '#6d5c9c',
  red: '#9a4f51',
  yellow: '#dbb970',
  orange: '#9e6331',
  green: '#3c7847',
  gray: '#ffffff00'
};

interface Props {
  value?: number | null;
  compact?: boolean;
  labelPrefix?: string;
}

export default function QualityBadge({ value, compact, labelPrefix = '' }: Props) {
  const isUnknown = value === null || value === undefined || Number.isNaN(value);
  const quality = isUnknown ? null : describeQuality(value);
  const backgroundColor = isUnknown ? '#9ba6b5' : QUALITY_COLOR_HEX[quality?.color ?? 'yellow'];
  const textColor = isUnknown ? '#342c23' : quality?.color === 'yellow' ? '#342c23' : '#ffffff';
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
