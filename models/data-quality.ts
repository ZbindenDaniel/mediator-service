// Catalogue data-quality grade (lever L10) — the data types. The formula that produces a
// DataQualityGrade lives in `backend/agentic/data-quality.ts`; the types live here so models stay a
// leaf (as `Finding` does in agentic-findings.ts) and payload types can reference the grade without a
// backend import.

import type { Finding } from './agentic-findings';

export type DataQualityFreshness = 'current' | 'stale' | 'unknown';

export interface DataQualityInputs {
  findings: Finding[];
  /** Spec-contract field counts for the item's subcategory (0 when the contract has no such field). */
  requiredTotal: number;
  requiredMissing: number;
  desiredTotal: number;
  desiredMissing: number;
  freshness: DataQualityFreshness;
}

export interface DataQualityGrade {
  /** 0..1 blended score. */
  score: number;
  /** 1..5 (pessimistic band of `score`), or null if it can't be graded. */
  grade: number | null;
  /** German-facing label for `grade` (reuses the condition-grade labels). */
  label: string | null;
  /** True when an unresolved `block` finding capped the score (a knock-out, like a swollen battery). */
  capped: boolean;
  /** The three sub-scores, surfaced so the badge/tooltip can explain the number. */
  components: { conformance: number; completeness: number; freshness: number };
}
