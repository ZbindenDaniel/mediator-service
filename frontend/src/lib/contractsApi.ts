import type { QualityContract } from '../../../models/quality-contract';
import type { SpecContract } from '../../../models/spec-contract';

// Module-level caches — keyed by subcategory code or 'general'.
// Cleared by page reload; restart-safe since data comes from API which reads from disk.
const qualityCache = new Map<string, QualityContract>();
const specCache = new Map<number, SpecContract>();

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
