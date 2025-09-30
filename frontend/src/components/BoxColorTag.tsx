import React, { useMemo } from 'react';
import { resolveBoxColorFromLocation } from '../data/boxColors';

interface BoxColorTagProps {
  locationKey?: string | null;
  className?: string;
  boxId?: string | null;
}

export default function BoxColorTag({ locationKey, className, boxId }: BoxColorTagProps) {
  const normalizedLocation = locationKey?.trim();
  const normalizedBoxId = boxId?.trim();
  console.log('Rendering BoxColorTag', { locationKey, normalizedLocation, boxId: normalizedBoxId });

  const colorOption = useMemo(() => {
    if (!normalizedLocation) {
      return undefined;
    }

    const resolved = resolveBoxColorFromLocation(normalizedLocation);
    if (!resolved) {
      console.warn('No color mapping found for location', { location: normalizedLocation });
    }
    return resolved;
  }, [normalizedLocation]);

  if (!normalizedLocation) {
    return <span className={className}>{normalizedBoxId || '(nicht gesetzt)'}</span>;
  }

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
        {colorOption ? `${colorOption.label}` : normalizedLocation}
      </span>
    </span>
  );
}
