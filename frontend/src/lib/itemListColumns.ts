// Which optional item-list columns are shown. Per browser (like theme/simple mode): a display
// preference, not data worth a server round-trip. A-Nr and Artikel are always shown and not listed.

export type ItemListColumnKey =
  | 'price'
  | 'image'
  | 'box'
  | 'location'
  | 'agentic'
  | 'stock'
  | 'quality'
  | 'shop'
  | 'zubehoer'
  | 'subcategory'
  | 'lastModified';

export interface ItemListColumnOption {
  key: ItemListColumnKey;
  label: string;
  defaultVisible: boolean;
  // Feature flag that must be on for the column to exist at all.
  feature?: 'agentic' | 'shopware';
}

// Order here is the order in the table.
export const ITEM_LIST_COLUMN_OPTIONS: ItemListColumnOption[] = [
  { key: 'price', label: 'Preis (CHF)', defaultVisible: true },
  { key: 'image', label: 'Bild', defaultVisible: false },
  { key: 'box', label: 'Behälter', defaultVisible: true },
  { key: 'location', label: 'Lagerort', defaultVisible: true },
  { key: 'agentic', label: 'Ki-Status', defaultVisible: true, feature: 'agentic' },
  { key: 'stock', label: 'Anzahl', defaultVisible: true },
  { key: 'quality', label: 'Qualität', defaultVisible: true },
  { key: 'shop', label: 'Shop', defaultVisible: true, feature: 'shopware' },
  { key: 'zubehoer', label: 'Zubehör', defaultVisible: false },
  { key: 'subcategory', label: 'Unterkategorie', defaultVisible: false },
  { key: 'lastModified', label: 'Zuletzt geändert', defaultVisible: true }
];

export const ITEM_LIST_COLUMNS_STORAGE_KEY = 'mediator-item-list-columns';

export function defaultItemListColumns(): Set<ItemListColumnKey> {
  return new Set(ITEM_LIST_COLUMN_OPTIONS.filter((c) => c.defaultVisible).map((c) => c.key));
}

export function loadItemListColumns(): Set<ItemListColumnKey> {
  try {
    const raw = localStorage.getItem(ITEM_LIST_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultItemListColumns();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultItemListColumns();
    const known = new Set<string>(ITEM_LIST_COLUMN_OPTIONS.map((c) => c.key));
    return new Set(parsed.filter((k): k is ItemListColumnKey => typeof k === 'string' && known.has(k)));
  } catch (err) {
    console.error('Failed to read item list columns', err);
    return defaultItemListColumns();
  }
}

export function saveItemListColumns(columns: Set<ItemListColumnKey>): void {
  try {
    localStorage.setItem(ITEM_LIST_COLUMNS_STORAGE_KEY, JSON.stringify([...columns]));
  } catch (err) {
    console.error('Failed to persist item list columns', err);
  }
}
