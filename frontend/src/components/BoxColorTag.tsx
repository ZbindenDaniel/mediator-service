import React, { useMemo } from 'react';
import { isUnplacedLocation, resolveBoxColorFromLocation } from '../data/boxColors';

// TODO(agent): Revisit color-based tags once all location displays emphasize labels over palette metadata.

interface BoxColorTagProps {
  locationKey?: string | null;
  labelOverride?: string | null;
  className?: string;
}

export default function BoxColorTag({ locationKey, labelOverride, className }: BoxColorTagProps) {
  const normalizedLocation = locationKey?.trim() ?? '';
  const unplaced = useMemo(() => isUnplacedLocation(normalizedLocation), [normalizedLocation]);
  const colorOption = useMemo(() => {
    if (!normalizedLocation || unplaced) {
      return undefined;
    }

    const resolved = resolveBoxColorFromLocation(normalizedLocation);
    if (!resolved) {
      console.warn('No color mapping found for location', { location: normalizedLocation });
    }
    return resolved;
  }, [normalizedLocation, unplaced]);

  if (unplaced || !normalizedLocation) {
    return <span className={className}>(nicht gesetzt)</span>;
  }

  if (!colorOption) {
    console.warn('No color mapping found for location', { location: normalizedLocation });
  }

  const label = labelOverride?.trim() || colorOption?.label || normalizedLocation;

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
      <span>{label}</span>
    </span>
  );
}
