// TODO: Extend Einheit mapping if new supplier values surface.

export const ITEM_EINHEIT_VALUES = ['Stk', 'Mix'] as const;
export type ItemEinheit = (typeof ITEM_EINHEIT_VALUES)[number];

export const DEFAULT_ITEM_EINHEIT: ItemEinheit = 'Stk';

export interface ItemInstance {
  ItemUUID: string;
  Artikel_Nummer?: string | null;
  BoxID: string | null;
  Location?: string | null;
  UpdatedAt: Date;
  Datum_erfasst?: Date;
  Auf_Lager?: number;
}

export interface ItemRef {
  Artikel_Nummer: string;
  Grafikname?: string;
  Artikelbeschreibung?: string;
  Verkaufspreis?: number;
  Kurzbeschreibung?: string;
  Langtext?: string;
  Hersteller?: string;
  Länge_mm?: number;
  Breite_mm?: number;
  Höhe_mm?: number;
  Gewicht_kg?: number;
  Hauptkategorien_A?: number;
  Unterkategorien_A?: number;
  Hauptkategorien_B?: number;
  Unterkategorien_B?: number;
  Veröffentlicht_Status?: boolean | string;
  Shopartikel?: number;
  Artikeltyp?: string;
  Einheit?: ItemEinheit;
  EntityType?: string;
}

export type Item = ItemInstance & Partial<ItemRef>;

export interface NormalizedEinheitResult {
  value: ItemEinheit;
  normalizedFrom?: string;
  reason?: 'missing' | 'blank' | 'normalized' | 'invalid' | 'non-string';
}

function removeDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function isItemEinheit(value: unknown): value is ItemEinheit {
  return typeof value === 'string' && (ITEM_EINHEIT_VALUES as readonly string[]).includes(value);
}

const EINHEIT_SYNONYMS: Record<string, ItemEinheit> = {
  stk: 'Stk',
  stck: 'Stk',
  stueck: 'Stk',
  stuek: 'Stk',
  stuck: 'Stk',
  st: 'Stk',
  mix: 'Mix'
};

export function normalizeItemEinheit(rawValue: unknown): NormalizedEinheitResult {
  if (rawValue === null || rawValue === undefined) {
    return { value: DEFAULT_ITEM_EINHEIT, reason: 'missing' };
  }

  if (typeof rawValue !== 'string') {
    return { value: DEFAULT_ITEM_EINHEIT, reason: 'non-string' };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { value: DEFAULT_ITEM_EINHEIT, reason: 'blank' };
  }

  if (isItemEinheit(trimmed)) {
    return {
      value: trimmed,
      normalizedFrom: trimmed === rawValue ? undefined : rawValue,
      reason: trimmed === rawValue ? undefined : 'normalized'
    };
  }

  const normalizedAscii = removeDiacritics(trimmed).replace(/\s+/g, '');
  const lookupKey = normalizedAscii.toLowerCase();
  const synonym = EINHEIT_SYNONYMS[lookupKey];
  if (synonym) {
    return { value: synonym, normalizedFrom: trimmed, reason: 'normalized' };
  }

  return { value: DEFAULT_ITEM_EINHEIT, normalizedFrom: trimmed, reason: 'invalid' };
}
