import React from 'react';
import { logError, logger } from '../utils/logger';

// TODO(agent): Confirm BoxTag presentation stays aligned with the latest location label requirements.

interface BoxTagProps {
  locationKey?: string | null;
  labelOverride?: string | null;
  className?: string;
}

export default function BoxTag({ locationKey, labelOverride, className }: BoxTagProps) {
  let normalizedLocation = '';
  let normalizedLabel = '';

  try {
    normalizedLocation = locationKey?.trim() ?? '';
  } catch (error) {
    logError('Failed to normalize box location', error, { locationKey });
  }

  try {
    normalizedLabel = labelOverride?.trim() ?? '';
  } catch (error) {
    logError('Failed to normalize box label override', error, { labelOverride });
  }

  if (!normalizedLocation) {
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
      <span className="mono">{normalizedLocation}</span>
      {normalizedLabel ? <span>{normalizedLabel}</span> : null}
    </span>
  );
}
