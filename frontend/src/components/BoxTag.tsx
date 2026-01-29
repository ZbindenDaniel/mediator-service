import React from 'react';
import { formatShelfLabel } from '../lib/shelfLabel';
import { logError, logger } from '../utils/logger';

// TODO(agent): Validate BoxTag primary/secondary label layout with production shelf label data.
// TODO(agent): Confirm BoxTag showId line ordering meets scan workflows for inventory teams.

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

function resolveFallbackLabel(locationKey: string): string | null {
  if (!locationKey) {
    return null;
  }

  try {
    return formatShelfLabel(locationKey);
  } catch (error) {
    logError('Failed to format fallback shelf label for box tag', error, { locationKey });
    return null;
  }
}

export default function BoxTag({ locationKey, labelOverride, className, showId = false }: BoxTagProps) {
  const normalizedLocation = normalizeTagValue(locationKey, 'box location');
  const normalizedLabel = normalizeTagValue(labelOverride, 'box label override');
  const fallbackLabel = resolveFallbackLabel(normalizedLocation);
  const displayLabel = normalizedLabel || fallbackLabel || normalizedLocation;
  const secondaryLabel = fallbackLabel;
  const showRawId = Boolean(
    showId && normalizedLocation && (displayLabel !== normalizedLocation || secondaryLabel),
  );

  if (normalizedLocation && !fallbackLabel) {
    logger.warn('Shelf label formatter returned empty label for box tag', {
      locationKey: normalizedLocation,
    });
  }

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
      {secondaryLabel ? <span className="muted">{secondaryLabel}</span> : null}
      {showRawId ? (
        <span className="mono">{normalizedLocation}</span>
      ) : null}
    </span>
  );
}
