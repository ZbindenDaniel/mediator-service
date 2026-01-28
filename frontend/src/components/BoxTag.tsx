import React from 'react';
import { logError, logger } from '../utils/logger';

// TODO(agent): Confirm BoxTag presentation stays aligned with the latest location label requirements.
// TODO(agent): Revisit BoxTag showId defaults once label coverage is validated across all box surfaces.

interface BoxTagProps {
  locationKey?: string | null;
  labelOverride?: string | null;
  className?: string;
  showId?: boolean;
}

function normalizeTagValue(value: string | null | undefined, context: string): string {
  if (value == null) {
    return '';
  }

  try {
    return value.trim();
  } catch (error) {
    logError(`Failed to normalize ${context} for box tag`, error, { value });
    return '';
  }
}

export default function BoxTag({ locationKey, labelOverride, className, showId = false }: BoxTagProps) {
  let normalizedLocation = '';
  let normalizedLabel = '';

  normalizedLocation = normalizeTagValue(locationKey, 'box location');
  normalizedLabel = normalizeTagValue(labelOverride, 'box label override');

  const displayLabel = normalizedLabel || normalizedLocation;

  if (!displayLabel) {
    logger.warn('Missing box location', { locationKey });
    return <span className={className}>(nicht gesetzt)</span>;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '0.125rem'
      }}
    >
      <span>{displayLabel}</span>
      {showId && normalizedLabel && normalizedLocation ? (
        <span className="mono">{normalizedLocation}</span>
      ) : null}
    </span>
  );
}
