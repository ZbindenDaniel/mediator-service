import type { QualityContract } from '../../../models/quality-contract';
import type { SpecContract } from '../../../models/spec-contract';
import type { AssemblyContract } from '../../../models/assembly-contract';

// Module-level caches — keyed by subcategory code or 'general'.
const qualityCache = new Map<string, QualityContract>();
const specCache = new Map<number, SpecContract>();
const assemblyCache = new Map<number, AssemblyContract>();

export async function fetchQualityContract(key: string | number): Promise<QualityContract | null> {
  const cacheKey = String(key);
  if (qualityCache.has(cacheKey)) return qualityCache.get(cacheKey)!;
  try {
    const res = await fetch(`/api/contracts/quality/${cacheKey}`);
    if (!res.ok) return null;
    const contract = await res.json() as QualityContract;
    qualityCache.set(cacheKey, contract);
    return contract;
  } catch {
    return null;
  }
}

export async function fetchAssemblyContract(subCategory: number): Promise<AssemblyContract | null> {
  if (assemblyCache.has(subCategory)) return assemblyCache.get(subCategory)!;
  try {
    const res = await fetch(`/api/contracts/assembly/${subCategory}`);
    if (!res.ok) return null;
    const contract = await res.json() as AssemblyContract;
    assemblyCache.set(subCategory, contract);
    return contract;
  } catch {
    return null;
  }
}

export async function fetchSpecContract(subcategory: number): Promise<SpecContract | null> {
  if (specCache.has(subcategory)) return specCache.get(subcategory)!;
  try {
    const res = await fetch(`/api/contracts/specs/${subcategory}`);
    if (!res.ok) return null;
    const contract = await res.json() as SpecContract;
    specCache.set(subcategory, contract);
    return contract;
  } catch {
    return null;
  }
}
