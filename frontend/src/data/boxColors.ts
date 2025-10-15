import { BOX_COLORS as BASE_BOX_COLORS, BoxColorDefinition, getBoxColor } from '../../../models';

const UNPLACED_LOCATION_VALUES = new Set([
  '',
  'A-00-00',
  'A0000',
  'UNSET',
  'UNPLACED',
  'NONE',
  'N/A',
  'NOT SET'
]);

function normalizeLocationValue(location?: string | null): string {
  return (location ?? '').trim().toUpperCase();
}

export function isUnplacedLocation(location?: string | null): boolean {
  const normalized = normalizeLocationValue(location);

  if (!normalized) {
    return true;
  }

  if (UNPLACED_LOCATION_VALUES.has(normalized)) {
    return true;
  }

  if (/^[A-Z]-00-00$/.test(normalized)) {
    return true;
  }

  return false;
}

export type BoxColorOption = BoxColorDefinition;

export const BOX_COLORS: ReadonlyArray<BoxColorOption> = BASE_BOX_COLORS;

export function resolveBoxColorFromLocation(location?: string | null): BoxColorOption | undefined {
  const normalizedLocation = normalizeLocationValue(location);

  if (isUnplacedLocation(normalizedLocation)) {
    return undefined;
  }

  try {
    // TODO; this is very wrong. The box Id has nothing todo with the colorKey. Here we have to load the box and get the color/location from there
    const colorKey = normalizedLocation.split('-')[0]?.trim().toUpperCase();
    if (!colorKey) {
      return undefined;
    }
    return getBoxColor(colorKey);
  } catch (err) {
    console.error('Failed to resolve box color from location', { location: normalizedLocation, err });
    return undefined;
  }
}
