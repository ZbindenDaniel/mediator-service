import type { ItemRef } from './item-ref';

export interface ItemQuant {
  ItemUUID: string;
  BoxID: string | null;
  Location?: string | null;
  UpdatedAt: Date;
  Datum_erfasst?: Date;
  Auf_Lager?: number;
}

export type ItemRecord = ItemRef & ItemQuant;

export function normaliseItemQuant(raw: Partial<ItemQuant> | null | undefined): ItemQuant | null {
  if (!raw) {
    console.warn('normaliseItemQuant received empty payload');
    return null;
  }

  const itemId = typeof raw.ItemUUID === 'string' && raw.ItemUUID.trim() ? raw.ItemUUID : null;
  if (!itemId) {
    console.warn('normaliseItemQuant discarded payload without ItemUUID', { payload: raw });
    return null;
  }

  const updatedAtValue = raw.UpdatedAt instanceof Date ? raw.UpdatedAt : raw.UpdatedAt ? new Date(raw.UpdatedAt) : null;
  if (!updatedAtValue || Number.isNaN(updatedAtValue.getTime())) {
    console.warn('normaliseItemQuant discarded payload without valid UpdatedAt', { payload: raw });
    return null;
  }

  let boxId: string | null;
  if (typeof raw.BoxID === 'string') {
    const trimmed = raw.BoxID.trim();
    boxId = trimmed ? trimmed : null;
  } else if (raw.BoxID == null) {
    boxId = null;
  } else {
    console.warn('normaliseItemQuant coerced BoxID to null', { payload: raw });
    boxId = null;
  }

  let quantity: number | undefined;
  if (typeof raw.Auf_Lager === 'number') {
    quantity = raw.Auf_Lager;
  } else if (raw.Auf_Lager != null) {
    const parsed = Number(raw.Auf_Lager);
    if (!Number.isNaN(parsed)) {
      quantity = parsed;
    } else {
      console.warn('normaliseItemQuant could not parse Auf_Lager value', { payload: raw });
    }
  }

  return {
    ItemUUID: itemId,
    BoxID: boxId,
    Location: typeof raw.Location === 'string' ? raw.Location.trim() || undefined : undefined,
    UpdatedAt: updatedAtValue,
    Datum_erfasst:
      raw.Datum_erfasst instanceof Date
        ? raw.Datum_erfasst
        : raw.Datum_erfasst
        ? new Date(raw.Datum_erfasst)
        : undefined,
    Auf_Lager: quantity
  };
}

// TODO: Replace legacy ItemQuant fields with camelCase variants once the API surface is adjusted.
