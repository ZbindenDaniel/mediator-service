import fs from 'fs';
import path from 'path';
import type { QualityContract } from '../../models/quality-contract';
import type { SpecContract } from '../../models/spec-contract';
import type { AssemblyContract } from '../../models/assembly-contract';
import type { StandardsContract } from '../../models/agentic-findings';
import { resolveContractReadPath, listContractCodes } from './paths';
import { parentCategoryCode } from '../lib/taxonomy';

// Module-level caches — cleared on restart, populated lazily on first access.
const qualityCache = new Map<string, QualityContract>();
const specCache = new Map<number, SpecContract>();
const assemblyCache = new Map<number, AssemblyContract>();
let specSubcategoriesCache: number[] | null = null;

function loadJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadQualityContractByKey(key: string): QualityContract | null {
  if (qualityCache.has(key)) return qualityCache.get(key)!;
  const contract = loadJsonFile<QualityContract>(resolveContractReadPath(path.join('quality', `${key}.json`)));
  if (contract) qualityCache.set(key, contract);
  return contract;
}

export function getGeneralQualityContract(): QualityContract | null {
  return loadQualityContractByKey('general');
}

/** Hauptkategorie of a subcategory by the taxonomy's numeric convention (201 → 20, 2101 → 210). */
/**
 * Key of the shared Hauptkategorie contract. The parent comes from the taxonomy; `floor(code / 10)`
 * is only the fallback for codes outside it (it is wrong for 2110+ under main category 210).
 */
export function groupKeyFor(subcategory: number, parentCode: number | null = parentCategoryCode(subcategory)): string {
  return `group-${parentCode ?? Math.floor(subcategory / 10)}`;
}

/**
 * The quality contract an item of this subcategory is assessed with: the shared Hauptkategorie
 * contract (`quality/group-<haupt>.json`, e.g. condition + part number for all laptop parts) followed
 * by the subcategory's own file. Merged here so every caller (review, intake, score, HTTP) agrees.
 */
export function getQualityContract(subcategory: number): QualityContract | null {
  const own = loadQualityContractByKey(String(subcategory));
  const group = loadQualityContractByKey(groupKeyFor(subcategory));
  if (!group) return own;
  return {
    ...(own ?? {}),
    version: own?.version ?? group.version,
    subCategory: subcategory,
    questions: [...group.questions, ...(own?.questions ?? []).filter((q) => !group.questions.some((g) => g.id === q.id))]
  };
}

export function getSpecContract(subcategory: number): SpecContract | null {
  if (specCache.has(subcategory)) return specCache.get(subcategory)!;
  const contract = loadJsonFile<SpecContract>(resolveContractReadPath(path.join('specs', `${subcategory}.json`)));
  if (contract) specCache.set(subcategory, contract);
  return contract;
}

// The house standards rule set (contracts/standards.json) — global, not per-subcategory. Cached at
// module level like the other contracts; a `null` return (missing/invalid file) means "no rules",
// so the findings engine simply emits no standards findings rather than failing a run.
let standardsCache: StandardsContract | null | undefined;

export function getStandardsContract(): StandardsContract | null {
  if (standardsCache !== undefined) return standardsCache;
  standardsCache = loadJsonFile<StandardsContract>(resolveContractReadPath('standards.json'));
  return standardsCache;
}

export function getAssemblyContract(subCategory: number): AssemblyContract | null {
  if (assemblyCache.has(subCategory)) return assemblyCache.get(subCategory)!;
  const contract = loadJsonFile<AssemblyContract>(resolveContractReadPath(path.join('assembly', `${subCategory}.json`)));
  if (contract) assemblyCache.set(subCategory, contract);
  return contract;
}

export function listSpecContractSubcategories(): number[] {
  if (specSubcategoriesCache) return specSubcategoriesCache;
  const codes = listContractCodes('specs')
    .map(k => parseInt(k, 10))
    .filter(n => !isNaN(n));
  specSubcategoriesCache = codes;
  return codes;
}

/** Codes that have a contract of the given type (shipped ∪ overlay). Used for coverage display. */
export function listContractSubcategories(type: 'quality' | 'specs' | 'assembly'): string[] {
  return listContractCodes(type);
}

/** Clears all contract caches so a freshly uploaded/reverted contract is picked up immediately. */
export function clearContractCaches(): void {
  qualityCache.clear();
  specCache.clear();
  assemblyCache.clear();
  specSubcategoriesCache = null;
  filterableSpecKeysCache = null;
  standardsCache = undefined;
}

let filterableSpecKeysCache: Set<string> | null = null;

// The union of every spec-contract field key across all subcategories. Used to decide which Shopware
// property groups are storefront-filterable: only recognized spec fields filter, so freeform Langtext
// keys are still pushed as (non-filterable) properties instead of flooding the filter sidebar.
// A Shopware property_group's `filterable` flag is global (not per product), so the whitelist must be
// the union across contracts — a per-product decision would flip a shared group's flag on every sync.
export function getFilterableSpecKeys(): Set<string> {
  if (filterableSpecKeysCache) return filterableSpecKeysCache;
  const keys = new Set<string>();
  for (const sub of listSpecContractSubcategories()) {
    const contract = getSpecContract(sub);
    for (const field of contract?.fields ?? []) {
      const key = field.key?.trim();
      if (key) keys.add(key);
    }
  }
  filterableSpecKeysCache = keys;
  return keys;
}
