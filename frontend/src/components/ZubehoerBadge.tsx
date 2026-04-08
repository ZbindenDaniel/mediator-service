import React from 'react';

/** Visual connection state of a Zubehör (accessory) item */
export type ZubehoerMode = 'connected' | 'available' | null;

interface Props {
  /** 'connected' = physically mounted instance relation exists;
   *  'available' = ref-level compatibility only, no instance relation;
   *  null = not an accessory */
  mode?: ZubehoerMode;
  compact?: boolean;
}

const COLORS: Record<NonNullable<ZubehoerMode>, { bg: string; fg: string; border: string; label: string }> = {
  connected: { bg: '#2da44e', fg: '#ffffff', border: '#2da44e', label: 'Verbunden' },
  available: { bg: 'transparent', fg: '#57606a', border: '#8c959f', label: 'Zubehör' }
};

export default function ZubehoerBadge({ mode, compact }: Props) {
  if (!mode) return null;

  const colors = COLORS[mode];
  const className = compact ? 'quality-badge quality-badge--compact' : 'quality-badge';

  return (
    <span
      aria-label={colors.label}
      className={className}
      title={colors.label}
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`
      }}
    >
      <span className="quality-badge__label">Z</span>
    </span>
  );
}
