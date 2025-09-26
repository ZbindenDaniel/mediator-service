export interface BoxColorDefinition {
  /**
   * Identifier encoded in the first segment of a Standort (e.g. `A` in `A-01-01`).
   */
  key: string;
  /**
   * Human readable label for UI displays.
   */
  label: string;
  /**
   * Representative hex color that can be used for rendering.
   */
  hex: string;
}

export const BOX_COLORS: ReadonlyArray<BoxColorDefinition> = [
  { key: 'A', label: 'Rot', hex: '#c5221f' },
  { key: 'B', label: 'Orange', hex: '#f29900' },
  { key: 'C', label: 'Gelb', hex: '#f2c94c' },
  { key: 'D', label: 'Grün', hex: '#0f9d58' },
  { key: 'E', label: 'Türkis', hex: '#2ab7ca' },
  { key: 'F', label: 'Blau', hex: '#3b82f6' },
  { key: 'G', label: 'Violett', hex: '#7e57c2' },
  { key: 'H', label: 'Pink', hex: '#e91e63' },
  { key: 'I', label: 'Braun', hex: '#8d6e63' },
  { key: 'J', label: 'Grau', hex: '#607d8b' },
  { key: 'K', label: 'Schwarz', hex: '#212121' },
  { key: 'L', label: 'Weiß', hex: '#f5f5f5' }
] as const;

export const BOX_COLOR_KEYS: ReadonlyArray<string> = BOX_COLORS.map((color) => color.key);

export const BOX_COLOR_KEY_SET: ReadonlySet<string> = new Set(BOX_COLOR_KEYS);

export function getBoxColor(key: string): BoxColorDefinition | undefined {
  const normalized = key.trim().toUpperCase();
  return BOX_COLORS.find((color) => color.key === normalized);
}
