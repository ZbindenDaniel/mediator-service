import { BOX_COLORS as BASE_BOX_COLORS, BoxColorDefinition, getBoxColor } from '../../../models';

export type BoxColorOption = BoxColorDefinition;

export const BOX_COLORS: ReadonlyArray<BoxColorOption> = BASE_BOX_COLORS;

export function resolveBoxColorFromLocation(location?: string | null): BoxColorOption | undefined {
  if (!location) {
    return undefined;
  }

  try {
    const colorKey = location.split('-')[0]?.trim().toUpperCase();
    if (!colorKey) {
      return undefined;
    }
    return getBoxColor(colorKey);
  } catch (err) {
    console.error('Failed to resolve box color from location', { location, err });
    return undefined;
  }
}
