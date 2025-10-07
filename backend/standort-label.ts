import { BOX_COLORS } from '../models';

// TODO: Load Standort label mappings from configuration when dynamic layouts are required.

const STANDORT_LABEL_LOOKUP = new Map<string, string>(
  BOX_COLORS.map((color) => [color.key.toUpperCase(), color.label])
);

export function normalizeStandortCode(raw?: string | null): string {
  return (raw ?? '').trim().toUpperCase();
}

export function resolveStandortLabel(raw?: string | null): string | null {
  const normalized = normalizeStandortCode(raw);
  if (!normalized) {
    return null;
  }

  if (STANDORT_LABEL_LOOKUP.has(normalized)) {
    return STANDORT_LABEL_LOOKUP.get(normalized) ?? null;
  }

  const leadingSegment = normalized.split('-')[0];
  if (leadingSegment && STANDORT_LABEL_LOOKUP.has(leadingSegment)) {
    return STANDORT_LABEL_LOOKUP.get(leadingSegment) ?? null;
  }

  return null;
}
