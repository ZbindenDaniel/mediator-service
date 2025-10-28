import type { Item, ItemRef } from '../../../models/item';
import { ItemEinheit } from '../../../models/item';
import type { ShopwareItemProjection, ShopwareProductCustomFields, ShopwareProductPayload } from './types';

const ITEM_REF_KEYS: readonly (keyof ItemRef)[] = [
  'Artikel_Nummer',
  'Grafikname',
  'Artikelbeschreibung',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg',
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Artikeltyp',
  'Einheit',
  'EntityType'
] as const;

type ItemRefKeyCoverageCheck = Exclude<keyof ItemRef, (typeof ITEM_REF_KEYS)[number]> extends never ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _itemRefCoverageCheck: ItemRefKeyCoverageCheck = true;

const OPTIONAL_ITEM_REF_KEYS = ITEM_REF_KEYS.filter((key) => key !== 'Artikel_Nummer');

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (['1', 'true', 'yes', 'y', 'ja', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'nein', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function extractCustomFields(item: Partial<ItemRef> & Partial<Pick<Item, 'Auf_Lager'>>): ShopwareProductCustomFields {
  const customFields: ShopwareProductCustomFields = {};
  for (const key of OPTIONAL_ITEM_REF_KEYS) {
    const value = item[key];
    if (value !== undefined) {
      customFields[key] = value;
    }
  }

  if (item.Auf_Lager !== undefined) {
    customFields.Auf_Lager = item.Auf_Lager;
  }

  return customFields;
}

export function mapItemToShopwareProduct(item: Item): ShopwareProductPayload {
  const customFields = extractCustomFields(item);

  const active = normalizeBoolean(item.Veröffentlicht_Status);

  return {
    productNumber: item.Artikel_Nummer,
    name: item.Artikelbeschreibung ?? null,
    description: item.Kurzbeschreibung ?? null,
    descriptionLong: item.Langtext ?? null,
    manufacturerNumber: item.Hersteller ?? null,
    width: item.Breite_mm ?? null,
    height: item.Höhe_mm ?? null,
    length: item.Länge_mm ?? null,
    weight: item.Gewicht_kg ?? null,
    price: item.Verkaufspreis ?? null,
    stock: item.Auf_Lager ?? null,
    active: active ?? null,
    unitId: item.Einheit ?? null,
    customFields,
    itemType: item.Artikeltyp ?? item.EntityType ?? null
  };
}

function resolveCustomField<T extends keyof ShopwareProductCustomFields>(
  customFields: ShopwareProductCustomFields | null | undefined,
  field: T
): ShopwareProductCustomFields[T] | undefined {
  if (!customFields) {
    return undefined;
  }
  return customFields[field];
}

function resolveUnit(customFields: ShopwareProductCustomFields | null | undefined, fallback: unknown): ItemEinheit | undefined {
  const customUnit = resolveCustomField(customFields, 'Einheit');
  if (customUnit && ItemEinheit[customUnit as keyof typeof ItemEinheit]) {
    return customUnit as ItemEinheit;
  }
  if (typeof fallback === 'string' && ItemEinheit[fallback as keyof typeof ItemEinheit]) {
    return fallback as ItemEinheit;
  }
  return undefined;
}

export function mapShopwareProductToItemRef(product: ShopwareProductPayload): ItemRef {
  if (!product.productNumber) {
    throw new Error('Shopware product is missing productNumber required to map to ItemRef');
  }

  const customFields = product.customFields ?? null;

  const itemRef: ItemRef = {
    Artikel_Nummer: product.productNumber,
    Grafikname: (resolveCustomField(customFields, 'Grafikname') as string | undefined) ?? undefined,
    Artikelbeschreibung: product.name ?? (resolveCustomField(customFields, 'Artikelbeschreibung') as string | undefined) ?? undefined,
    Verkaufspreis: product.price ?? (resolveCustomField(customFields, 'Verkaufspreis') as number | undefined) ?? undefined,
    Kurzbeschreibung: product.description ?? (resolveCustomField(customFields, 'Kurzbeschreibung') as string | undefined) ?? undefined,
    Langtext: product.descriptionLong ?? (resolveCustomField(customFields, 'Langtext') as string | undefined) ?? undefined,
    Hersteller: product.manufacturerNumber ?? (resolveCustomField(customFields, 'Hersteller') as string | undefined) ?? undefined,
    Länge_mm: (resolveCustomField(customFields, 'Länge_mm') as number | undefined) ?? product.length ?? undefined,
    Breite_mm: (resolveCustomField(customFields, 'Breite_mm') as number | undefined) ?? product.width ?? undefined,
    Höhe_mm: (resolveCustomField(customFields, 'Höhe_mm') as number | undefined) ?? product.height ?? undefined,
    Gewicht_kg: (resolveCustomField(customFields, 'Gewicht_kg') as number | undefined) ?? product.weight ?? undefined,
    Hauptkategorien_A: resolveCustomField(customFields, 'Hauptkategorien_A') as number | undefined,
    Unterkategorien_A: resolveCustomField(customFields, 'Unterkategorien_A') as number | undefined,
    Hauptkategorien_B: resolveCustomField(customFields, 'Hauptkategorien_B') as number | undefined,
    Unterkategorien_B: resolveCustomField(customFields, 'Unterkategorien_B') as number | undefined,
    Veröffentlicht_Status:
      (resolveCustomField(customFields, 'Veröffentlicht_Status') as ItemRef['Veröffentlicht_Status']) ??
      (typeof product.active === 'boolean' ? product.active : undefined),
    Shopartikel: resolveCustomField(customFields, 'Shopartikel') as number | undefined,
    Artikeltyp: product.itemType ?? (resolveCustomField(customFields, 'Artikeltyp') as string | undefined) ?? undefined,
    Einheit: resolveUnit(customFields, product.unitId),
    EntityType: resolveCustomField(customFields, 'EntityType') as string | undefined
  };

  return itemRef;
}

export function mapShopwareProductToItemProjection(product: ShopwareProductPayload): ShopwareItemProjection {
  const itemRef = mapShopwareProductToItemRef(product);
  const stock =
    product.stock ?? (resolveCustomField(product.customFields ?? null, 'Auf_Lager') as number | null | undefined) ?? undefined;

  return {
    ...itemRef,
    Auf_Lager: stock === null ? null : stock ?? undefined
  };
}

export function mapItemProjectionToShopwareProduct(item: ShopwareItemProjection): ShopwareProductPayload {
  const baseItem: Item = {
    ItemUUID: '',
    Artikel_Nummer: item.Artikel_Nummer,
    BoxID: null,
    UpdatedAt: new Date(0),
    Auf_Lager: item.Auf_Lager ?? undefined,
    ...item
  };

  return mapItemToShopwareProduct(baseItem);
}
