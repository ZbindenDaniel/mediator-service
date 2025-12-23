// TODO(agent): Extend category lookups to surface label names for numeric codes during export.
import { getCategoryLabelLookups, itemCategories } from '../../models';

export type CategoryFieldType = 'haupt' | 'unter';

interface CategoryLabelLookup {
  haupt: Map<string, number>;
  unter: Map<string, number>;
}

interface CategoryNameLookup {
  haupt: Map<number, string>;
  unter: Map<number, string>;
}

interface CategoryLookupCache {
  labelToCode: CategoryLabelLookup;
  codeToLabel: CategoryNameLookup;
}

let cachedLookup: CategoryLookupCache | null = null;

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

function buildCategoryLabelLookup(): CategoryLookupCache {
  const labelToCode: CategoryLabelLookup = {
    haupt: new Map<string, number>(),
    unter: new Map<string, number>(),
  };
  let codeToLabel: CategoryNameLookup = { haupt: new Map<number, string>(), unter: new Map<number, string>() };

  try {
    for (const category of itemCategories) {
      registerLabel(labelToCode.haupt, category.label, category.code);

      for (const subCategory of category.subcategories) {
        registerLabel(labelToCode.unter, subCategory.label, subCategory.code);
      }
    }
  } catch (error) {
    console.error('[category-label-lookup] Failed to build lookup', error);
  }

  try {
    const lookups = getCategoryLabelLookups();
    codeToLabel = {
      haupt: new Map(lookups.haupt),
      unter: new Map(lookups.unter),
    };
  } catch (error) {
    console.error('[category-label-lookup] Failed to build code-to-label lookup', error);
  }

  return { labelToCode, codeToLabel };
}

function ensureLookup(): CategoryLookupCache {
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

  const lookup = type === 'haupt' ? ensureLookup().labelToCode.haupt : ensureLookup().labelToCode.unter;
  return lookup.get(normalized);
}

export function resolveCategoryCodeToLabel(value: number | string, type: CategoryFieldType): string | undefined {
  const lookup = type === 'haupt' ? ensureLookup().codeToLabel.haupt : ensureLookup().codeToLabel.unter;
  try {
    const normalized =
      typeof value === 'number'
        ? value
        : /^-?\d+$/u.test(String(value).trim())
          ? Number.parseInt(String(value).trim(), 10)
          : null;

    if (normalized === null || !Number.isFinite(normalized)) {
      return undefined;
    }

    return lookup.get(normalized);
  } catch (error) {
    console.error('[category-label-lookup] Failed to resolve category label for code', { value, type, error });
    return undefined;
  }
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
