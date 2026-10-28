import type { Item } from '../../../models';

// Item list search: every word of the query must appear somewhere in the group, in any order and
// in any field. Deliberately permissive — a few extra hits are better than a missed item — so no
// whole-phrase match and no ranking (the list has its own sort).

export function normalizeSearchText(value: string): string {
  // NFD + stripping combining marks folds "ü" → "u", so "Gerat" still finds "Gerät".
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokenizeSearch(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

function collectValues(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectValues(entry, out));
    return;
  }
  if (typeof value === 'object') {
    // Spec objects: values only — keys like "RAM" sit on nearly every item and would match everything.
    Object.values(value as Record<string, unknown>).forEach((entry) => collectValues(entry, out));
  }
}

function itemSearchFields(item: Item): string[] {
  const out: string[] = [];
  collectValues([
    item.Artikelbeschreibung,
    item.Kurzbeschreibung,
    item.Hersteller,
    item.Artikel_Nummer,
    item.ItemUUID,
    item.SerialNumber,
    item.EAN,
    item.Suchbegriff
  ], out);
  // Langtext/InstanceSpecs arrive as objects or as raw text; raw text is searchable as is.
  collectValues(item.Langtext, out);
  collectValues(item.InstanceSpecs, out);
  return out;
}

export function buildSearchHaystack(items: Item[]): string {
  return normalizeSearchText(items.flatMap(itemSearchFields).join('\n'));
}

export function matchesSearchTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}
