// TODO(agent): Track Langtext payload migration and remove legacy fallback types when safe.
// TODO(agent): Remove ImageNames serialization once assets migrate to dedicated tables.
// TODO(agentic-status-model): Consider splitting agentic metadata into a dedicated view model to avoid bloating Item shape.
// TODO(agent): Confirm Einheit alias coverage after Mix -> Menge rename once legacy payloads are audited.
// TODO(quality-metadata): Align Quality field naming with ERP schema once upstream attributes are finalised.
import type { AgenticRunStatus } from './agentic-statuses';
export enum ItemEinheit {
  Stk = 'Stk',
  Menge = 'Menge'
}

export const ITEM_EINHEIT_VALUES = Object.freeze([ItemEinheit.Stk, ItemEinheit.Menge] as const);

const LEGACY_EINHEIT_ALIASES = new Map<string, ItemEinheit>([
  ['stk', ItemEinheit.Stk],
  ['stück', ItemEinheit.Stk],
  ['stueck', ItemEinheit.Stk],
  ['menge', ItemEinheit.Menge],
  ['mix', ItemEinheit.Menge],
]);

export function isItemEinheit(value: unknown): value is ItemEinheit {
  if (typeof value !== 'string') {
    return false;
  }
  return (ITEM_EINHEIT_VALUES as readonly string[]).includes(value);
}

export function normalizeItemEinheit(value: unknown): ItemEinheit | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (isItemEinheit(trimmed)) {
    return trimmed;
  }
  const normalizedKey = trimmed.toLowerCase();
  return LEGACY_EINHEIT_ALIASES.get(normalizedKey) ?? null;
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
  // Importers normalize Langtext "Qualität" labels into this numeric grade.
  Quality?: number | null;
}

export type LangtextPayload = Record<string, string>;

export interface ItemRef {
  Artikel_Nummer: string;
  Grafikname?: string;
  ImageNames?: string | null;
  Artikelbeschreibung?: string;
  Verkaufspreis?: number | null;
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
  // Importers normalize Langtext "Qualität" labels into this numeric grade.
  Quality?: number | null;
}

// TODO(agent): Verify Item metadata typing whenever export/import parity requirements evolve.
export type Item = ItemInstance & Partial<ItemRef> & {
  AgenticStatus?: AgenticRunStatus | null;
  AgenticReviewState?: string | null;
};
