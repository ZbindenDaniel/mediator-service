import { parseLangtext } from '../lib/langtext';
import { getSpecContract, getStandardsContract } from '../contracts/registry';
import { checkSpecGap } from '../../models/spec-contract';
import { buildFindings } from './findings';
import { computeReferenceDataQuality } from './data-quality';
import { composeRunVerdict } from './run-verdict';
import type { Finding } from '../../models/agentic-findings';
import type { DataQualityGrade } from '../../models/data-quality';

// Compute deterministic review findings from an item reference's CURRENT stored content, on read.
//
// Why on-read (not from the run's persisted output): a run regenerates Artikelbeschreibung/Langtext
// from scratch, so findings baked in at run time reflect that one output and go stale the instant the
// item is edited. Computing here from the live reference means findings always track what is actually
// stored now — manual edits included — which is what a reviewer needs to see, and makes the banned-
// phrase filter demonstrable by editing an item without re-running it.
//
// Covers banned phrases (over Artikelbeschreibung/Kurzbeschreibung + Langtext values) and missing-
// required spec fields (current subcategory contract vs. current Langtext). Intake conflicts need
// per-instance data and are left to the run-time path for now.
export function computeReferenceFindings(ref: Record<string, unknown> | null | undefined): Finding[] {
  if (!ref || typeof ref !== 'object') return [];

  const texts: Record<string, string> = {};
  if (typeof ref.Artikelbeschreibung === 'string') texts.Artikelbeschreibung = ref.Artikelbeschreibung;
  if (typeof ref.Kurzbeschreibung === 'string') texts.Kurzbeschreibung = ref.Kurzbeschreibung;

  let langtextObj: Record<string, unknown> = {};
  try {
    const parsed = parseLangtext(ref.Langtext, { context: 'reference-findings' });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      langtextObj = parsed as Record<string, unknown>;
    }
  } catch {
    // Unparseable Langtext → treat as empty; the gap check still flags required fields.
  }
  for (const [key, value] of Object.entries(langtextObj)) {
    if (typeof value === 'string') texts[key] = value;
  }

  let missingRequired: string[] = [];
  const subRaw = ref.Unterkategorien_A;
  const sub = typeof subRaw === 'number' ? subRaw : Number.parseInt(String(subRaw ?? ''), 10);
  if (Number.isInteger(sub) && sub > 0) {
    const contract = getSpecContract(sub);
    if (contract) missingRequired = checkSpecGap(contract, langtextObj).missingRequired;
  }

  return buildFindings({ texts, missingRequired }, getStandardsContract());
}

/**
 * Attaches the transient on-read review signals — `CurrentFindings` + `CurrentDataQuality` — to a run,
 * computed from the item's CURRENT reference content. The single source of truth for both, so EVERY
 * endpoint that hands a run to the UI (item detail AND the agentic status read) surfaces the review-by-
 * exception signals identically. (They diverged once: item detail returned the bare run, so the findings
 * panel + data-quality badge never rendered there.) Best-effort — the caller guards against throws.
 *
 * Also composes `CurrentVerdict`: a one-line, human-facing summary of the run's current state built from
 * the same signals (status + findings + grade), so a reviewer gets the gist without reading the diff.
 */
// Enrol-time triage: is this run-less ref's EXISTING data already good enough to skip the generative
// pipeline (search/extraction/categorization) and take the validate-only path? True only when the ref
// has a resolvable spec contract (so completeness is defined — a contract-less ref may still need
// categorization, so it gets a full run) AND no block/warn finding on its current content (missing
// required fields are block findings, banned phrases / intake conflicts are warn). Deterministic, no LLM.
// Note: this decides ROUTING only — the approve/review decision stays with the result handler's gate.
export function isValidateOnlyEligible(ref: Record<string, unknown> | null | undefined): boolean {
  if (!ref || typeof ref !== 'object') return false;
  const subRaw = ref.Unterkategorien_A;
  const sub = typeof subRaw === 'number' ? subRaw : Number.parseInt(String(subRaw ?? ''), 10);
  if (!Number.isInteger(sub) || sub <= 0) return false;
  if (!getSpecContract(sub)) return false; // no contract → can't judge completeness → needs a full run
  return !computeReferenceFindings(ref).some((f) => f.severity === 'block' || f.severity === 'warn');
}

export function attachCurrentReviewSignals<
  T extends { SpecContractVersion?: number | null; Status?: string | null }
>(
  run: T,
  ref: Record<string, unknown> | null | undefined
): T & { CurrentFindings: Finding[]; CurrentDataQuality: DataQualityGrade | null; CurrentVerdict: string } {
  const currentFindings = computeReferenceFindings(ref);
  const currentDataQuality = computeReferenceDataQuality(ref, currentFindings, run.SpecContractVersion ?? null);
  return {
    ...run,
    CurrentFindings: currentFindings,
    CurrentDataQuality: currentDataQuality,
    CurrentVerdict: composeRunVerdict({ status: run.Status ?? null, findings: currentFindings, dataQuality: currentDataQuality })
  };
}
