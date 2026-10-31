import type { Finding } from '../../models/agentic-findings';
import type { DataQualityFreshness, DataQualityInputs, DataQualityGrade } from '../../models/data-quality';
import { parseLangtext } from '../lib/langtext';
import { getSpecContract } from '../contracts/registry';
import { checkSpecGap } from '../../models/spec-contract';
import { gradeFromRange, gradeLabel } from '../../models/quality-score';

export type { DataQualityFreshness, DataQualityInputs, DataQualityGrade } from '../../models/data-quality';

// Lever L10 — a per-reference CATALOGUE DATA-QUALITY grade (how good the *data about* an item is),
// the mirror of main's condition quality-score (how good the *physical device* is). It is derived,
// never hand-set, and reuses the condition grade's 1–5 band mapping so operators read one scale.
//
// Slice 1 (this file): a pure formula + a ref wrapper, surfaced transiently on read next to the
// findings — NO stored column yet. We eyeball it on real items and tune the weights below before
// persisting, exactly as the findings engine went on-read (#933) before any schema change.
//
// Three signals, all already computed elsewhere:
//   - conformance  — is the content clean/correct?      (banned-phrase / conflict / standards findings)
//   - completeness — are the contract's fields filled?  (checkSpecGap: required vs desired coverage)
//   - freshness    — was it enriched under this contract? (stored SpecContractVersion vs current)

// --- Tunable formula (v0) ---------------------------------------------------------------------
// Everything an operator would want to adjust lives in one place. These are starting values to be
// tuned against real items before L10 slice 2 persists anything; do not treat them as settled.
export const DATA_QUALITY_WEIGHTS = {
  // How much each sub-score contributes to the blend (must sum to 1).
  blend: { conformance: 0.45, completeness: 0.4, freshness: 0.15 },
  // Per-finding penalty to conformance, by severity. missing_required is NOT counted here — it is
  // completeness, and counting it in both would double-punish an empty required field.
  conformancePenalty: { block: 0.5, warn: 0.25, info: 0.05 },
  // Required fields dominate completeness; desired fields are a smaller nudge.
  completeness: { required: 0.8, desired: 0.2 },
  // Freshness sub-score by state. "unknown" (no stored version / no contract) is mild, not punitive.
  freshness: { current: 1, unknown: 0.75, stale: 0.5 },
  // A single unresolved block finding (missing-required, or a block-severity banned phrase) caps the
  // whole grade: a catalogue entry with a hard defect cannot read as "good", mirroring the condition
  // score's knock-out. Capped to at most this score (≈ grade 3 under the default bands).
  blockCap: 0.4
} as const;

// Findings that speak to *conformance*. missing_required is handled by completeness (see above); any
// other type the engine emits (banned_phrase, intake_conflict, standards) is a content-correctness hit.
function isConformanceFinding(f: Finding): boolean {
  return f.type !== 'missing_required';
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computeDataQualityGrade(input: DataQualityInputs): DataQualityGrade {
  const w = DATA_QUALITY_WEIGHTS;

  let conformance = 1;
  for (const f of input.findings) {
    if (!isConformanceFinding(f)) continue;
    conformance -= w.conformancePenalty[f.severity] ?? 0;
  }
  conformance = clamp01(conformance);

  const requiredCoverage = input.requiredTotal === 0 ? 1 : clamp01((input.requiredTotal - input.requiredMissing) / input.requiredTotal);
  const desiredCoverage = input.desiredTotal === 0 ? 1 : clamp01((input.desiredTotal - input.desiredMissing) / input.desiredTotal);
  const completeness = clamp01(w.completeness.required * requiredCoverage + w.completeness.desired * desiredCoverage);

  const freshness = w.freshness[input.freshness];

  let score = clamp01(w.blend.conformance * conformance + w.blend.completeness * completeness + w.blend.freshness * freshness);

  const capped = input.findings.some((f) => f.severity === 'block') && score > w.blockCap;
  if (capped) score = w.blockCap;

  const grade = gradeFromRange({ min: score, max: score });
  return { score, grade, label: gradeLabel(grade), capped, components: { conformance, completeness, freshness } };
}

/**
 * Assembles the inputs from an item reference + its already-computed findings + the run's stored
 * contract version, then grades it. Returns null when the item has no subcategory spec contract —
 * without a contract there is no notion of "complete", so a data-quality grade would be meaningless.
 * The `findings` are passed in (not recomputed) so a status read scans the content only once.
 */
export function computeReferenceDataQuality(
  ref: Record<string, unknown> | null | undefined,
  findings: Finding[],
  storedContractVersion: number | null | undefined
): DataQualityGrade | null {
  if (!ref || typeof ref !== 'object') return null;

  const subRaw = ref.Unterkategorien_A;
  const sub = typeof subRaw === 'number' ? subRaw : Number.parseInt(String(subRaw ?? ''), 10);
  if (!Number.isInteger(sub) || sub <= 0) return null;
  const contract = getSpecContract(sub);
  if (!contract) return null;

  let langtextObj: Record<string, unknown> = {};
  try {
    const parsed = parseLangtext(ref.Langtext, { context: 'data-quality' });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) langtextObj = parsed as Record<string, unknown>;
  } catch {
    // Unparseable Langtext → treat as empty; the gap check then counts required fields as missing.
  }

  const gap = checkSpecGap(contract, langtextObj);
  const requiredTotal = contract.fields.filter((f) => f.required).length;
  const desiredTotal = contract.fields.length - requiredTotal;

  // Freshness: compare the version the item was last enriched under (on the run) to the live contract.
  // Missing stored version → "unknown" (older runs predate the stamp), not a penalty for being old.
  let freshness: DataQualityFreshness = 'unknown';
  if (typeof storedContractVersion === 'number') {
    freshness = storedContractVersion >= contract.version ? 'current' : 'stale';
  }

  return computeDataQualityGrade({
    findings,
    requiredTotal,
    requiredMissing: gap.missingRequired.length,
    desiredTotal,
    desiredMissing: gap.missingDesired.length,
    freshness
  });
}
