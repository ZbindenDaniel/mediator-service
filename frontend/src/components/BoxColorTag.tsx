import React, { useMemo } from 'react';
import { BOX_COLORS } from '../data/boxColors';

interface BoxColorTagProps {
  locationKey?: string | null;
  className?: string;
}

export default function BoxColorTag({ locationKey, className }: BoxColorTagProps) {
  const normalizedKey = locationKey?.trim().toLowerCase();

  const colorOption = useMemo(() => {
    if (!normalizedKey) {
      return undefined;
    }
    try {
      return BOX_COLORS.find((option) => option.value.toLowerCase() === normalizedKey);
    } catch (err) {
      console.error('Failed to resolve box color option', { locationKey, err });
      return undefined;
    }
  }, [locationKey, normalizedKey]);

  if (!colorOption) {
    return <span className={className}>(nicht gesetzt)</span>;
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
      <span>{colorOption.label}</span>
    </span>
  );
}
