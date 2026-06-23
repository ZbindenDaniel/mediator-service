import fs from 'fs';
import path from 'path';
import type { QualityContract } from '../../models/quality-contract';
import type { SpecContract } from '../../models/spec-contract';
import type { AssemblyContract } from '../../models/assembly-contract';

const CONTRACTS_DIR = path.resolve(__dirname, '../../contracts');

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
  const contract = loadJsonFile<QualityContract>(path.join(CONTRACTS_DIR, 'quality', `${key}.json`));
  if (contract) qualityCache.set(key, contract);
  return contract;
}

export function getGeneralQualityContract(): QualityContract | null {
  return loadQualityContractByKey('general');
}

export function getQualityContract(subcategory: number): QualityContract | null {
  return loadQualityContractByKey(String(subcategory));
}

export function getSpecContract(subcategory: number): SpecContract | null {
  if (specCache.has(subcategory)) return specCache.get(subcategory)!;
  const contract = loadJsonFile<SpecContract>(path.join(CONTRACTS_DIR, 'specs', `${subcategory}.json`));
  if (contract) specCache.set(subcategory, contract);
  return contract;
}

export function getAssemblyContract(subCategory: number): AssemblyContract | null {
  if (assemblyCache.has(subCategory)) return assemblyCache.get(subCategory)!;
  const contract = loadJsonFile<AssemblyContract>(path.join(CONTRACTS_DIR, 'assembly', `${subCategory}.json`));
  if (contract) assemblyCache.set(subCategory, contract);
  return contract;
}

/** @deprecated use getAssemblyContract */
export function getDisassemblyContract(subCategory: number): AssemblyContract | null {
  return getAssemblyContract(subCategory);
}

export function listSpecContractSubcategories(): number[] {
  if (specSubcategoriesCache) return specSubcategoriesCache;
  try {
    const files = fs.readdirSync(path.join(CONTRACTS_DIR, 'specs'));
    const codes = files
      .filter(f => f.endsWith('.json'))
      .map(f => parseInt(f.replace('.json', ''), 10))
      .filter(n => !isNaN(n));
    specSubcategoriesCache = codes;
    return codes;
  } catch {
    return [];
  }
}
