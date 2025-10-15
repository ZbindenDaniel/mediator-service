import React, { useMemo } from 'react';
import { isUnplacedLocation, resolveBoxColorFromLocation } from '../data/boxColors';

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

  if (unplaced || !colorOption) {
    return <span className={className}>(nicht gesetzt)</span>;
  }

  const label = labelOverride?.trim() || colorOption.label || normalizedLocation;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}
    >
      {colorOption ? (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '0.75rem',
            height: '0.75rem',
            borderRadius: '2px',
            backgroundColor: colorOption.hex,
            border: '1px solid rgba(0, 0, 0, 0.2)'
          }}
        />
      ) : null}
      <span>
        {label}
      </span>
    </span>
  );
}
