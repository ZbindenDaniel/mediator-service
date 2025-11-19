// TODO(agent): Track Langtext payload migration and remove legacy fallback types when safe.
export enum ItemEinheit {
  Stk = 'Stk',
  Mix = 'Mix'
}

export const ITEM_EINHEIT_VALUES = Object.freeze([ItemEinheit.Stk, ItemEinheit.Mix] as const);

export function isItemEinheit(value: unknown): value is ItemEinheit {
  if (typeof value !== 'string') {
    return false;
  }
  return (ITEM_EINHEIT_VALUES as readonly string[]).includes(value);
}

export interface ItemInstance {
  ItemUUID: string;
  Artikel_Nummer?: string | null;
  BoxID: string | null;
  Location?: string | null;
  UpdatedAt: Date;
  Datum_erfasst?: Date;
  Auf_Lager?: number;
  ShopwareVariantId?: string | null;
}

export type LangtextPayload = Record<string, string>;

export interface ItemRef {
  Artikel_Nummer: string;
  Grafikname?: string;
  Artikelbeschreibung?: string;
  Verkaufspreis?: number;
  Kurzbeschreibung?: string;
  Langtext?: string | LangtextPayload;
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
  ShopwareProductId?: string | null;
}

// TODO(agent): Verify Item metadata typing whenever export/import parity requirements evolve.
export type Item = ItemInstance & Partial<ItemRef>;
