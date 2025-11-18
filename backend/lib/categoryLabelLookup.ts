import { itemCategories } from '../../models';

export type CategoryFieldType = 'haupt' | 'unter';

interface CategoryLabelLookup {
  haupt: Map<string, number>;
  unter: Map<string, number>;
}

let cachedLookup: CategoryLabelLookup | null = null;

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeCategoryLabelCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const withoutDiacritics = stripDiacritics(trimmed)
    .replace(/ß/gi, 'ss')
    .replace(/&/g, 'und');

  return withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function registerLabel(target: Map<string, number>, label: string, code: number): void {
  const normalized = normalizeCategoryLabelCandidate(label);
  if (!normalized) {
    return;
  }

  const existing = target.get(normalized);
  if (existing !== undefined && existing !== code) {
    console.warn('[category-label-lookup] Conflicting category mapping detected', {
      normalized,
      providedLabel: label,
      existingCode: existing,
      incomingCode: code,
    });
    return;
  }

  target.set(normalized, code);
}

function buildCategoryLabelLookup(): CategoryLabelLookup {
  const haupt = new Map<string, number>();
  const unter = new Map<string, number>();

  try {
    for (const category of itemCategories) {
      registerLabel(haupt, category.label, category.code);

      for (const subCategory of category.subcategories) {
        registerLabel(unter, subCategory.label, subCategory.code);
      }
    }
  } catch (error) {
    console.error('[category-label-lookup] Failed to build lookup', error);
  }

  return { haupt, unter };
}

function ensureLookup(): CategoryLabelLookup {
  if (!cachedLookup) {
    // TODO(agent): Refresh cached lookups when taxonomy definitions change on disk.
    cachedLookup = buildCategoryLabelLookup();
  }
  return cachedLookup;
}

export function resolveCategoryLabelToCode(value: string, type: CategoryFieldType): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = normalizeCategoryLabelCandidate(trimmed);
  if (!normalized) {
    return undefined;
  }

  const lookup = type === 'haupt' ? ensureLookup().haupt : ensureLookup().unter;
  return lookup.get(normalized);
}

export function getKnownCategoryLabels(type: CategoryFieldType): string[] {
  if (type === 'haupt') {
    return itemCategories.map((category) => category.label);
  }

  const labels: string[] = [];
  for (const category of itemCategories) {
    for (const subCategory of category.subcategories) {
      labels.push(subCategory.label);
    }
  }
  return labels;
}
