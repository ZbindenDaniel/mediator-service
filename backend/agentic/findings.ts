// Deterministic findings engine (no LLM) — the first producer of review findings.
//
// Given the run's texts + the already-computed spec gap + intake conflicts, it emits a ranked list
// of Findings (see models/agentic-findings.ts). This is pure and side-effect-free so it is trivial
// to unit-test and cheap to run on every completion (and to backfill). Judgment findings (tone,
// coherence) are added later by the supervisor; they merge into the same list.

import type { Finding, FindingSeverity, StandardsContract } from '../../models/agentic-findings';

export interface FindingsInput {
  /** Field name → text to scan for banned phrases (e.g. Artikelbeschreibung, Kurzbeschreibung, Langtext values). */
  texts?: Record<string, string | null | undefined>;
  /** Required spec-contract keys that are still empty (from `checkSpecGap`). */
  missingRequired?: string[];
  /** Extracted-vs-intake conflicts, keyed by spec field (from `buildSpecContext`). */
  ambiguousFields?: Record<string, { itemValue: string; intakeValue: string }>;
}

// Order findings worst-first so the reviewer sees blocking issues before nits.
const SEVERITY_RANK: Record<FindingSeverity, number> = { block: 0, warn: 1, info: 2 };

function scanBannedPhrases(
  texts: Record<string, string | null | undefined>,
  standards: StandardsContract | null
): Finding[] {
  const rules = standards?.bannedPhrases;
  if (!rules || rules.length === 0) return [];
  const findings: Finding[] = [];

  for (const [field, rawValue] of Object.entries(texts)) {
    const value = typeof rawValue === 'string' ? rawValue : '';
    if (!value.trim()) continue;

    for (const rule of rules) {
      // A rule with an explicit `fields` list only applies to those fields.
      if (rule.fields && rule.fields.length > 0 && !rule.fields.includes(field)) continue;

      let matched: string | null = null;
      if (rule.regex) {
        try {
          // Case-insensitive; a bad pattern must never crash a run, so guard the compile.
          const m = value.match(new RegExp(rule.pattern, 'i'));
          matched = m ? m[0] : null;
        } catch {
          matched = null;
        }
      } else {
        const idx = value.toLowerCase().indexOf(rule.pattern.toLowerCase());
        matched = idx >= 0 ? value.slice(idx, idx + rule.pattern.length) : null;
      }
      if (matched == null) continue;

      findings.push({
        type: 'banned_phrase',
        severity: rule.severity ?? 'warn',
        field,
        message: rule.message,
        evidence: matched,
        suggestion: null, // the reviewer removes/rewrites; we don't guess a replacement
        ask: 'fix',
        ruleId: rule.id
      });
    }
  }
  return findings;
}

function missingRequiredFindings(missingRequired: string[]): Finding[] {
  return missingRequired
    .filter((key) => typeof key === 'string' && key.trim())
    .map((key) => ({
      type: 'missing_required' as const,
      severity: 'block' as const,
      field: key,
      message: `Pflichtfeld „${key}“ fehlt.`,
      evidence: null,
      suggestion: null,
      ask: 'fix' as const,
      ruleId: null
    }));
}

function intakeConflictFindings(
  ambiguousFields: Record<string, { itemValue: string; intakeValue: string }>
): Finding[] {
  return Object.entries(ambiguousFields).map(([key, { itemValue, intakeValue }]) => ({
    type: 'intake_conflict' as const,
    severity: 'warn' as const,
    field: key,
    // The reviewer chooses between the two known candidate values, evidence in hand.
    message: `„${key}“: Erfassung meldet „${intakeValue}“, extrahiert wurde „${itemValue}“.`,
    evidence: intakeValue,
    suggestion: intakeValue,
    ask: 'choose' as const,
    ruleId: null
  }));
}

/**
 * Builds the deterministic findings list for a run. Pure: same input → same output, no I/O.
 * Findings are returned worst-first (block → warn → info), stable within a severity.
 */
export function buildFindings(input: FindingsInput, standards: StandardsContract | null): Finding[] {
  const findings: Finding[] = [
    ...missingRequiredFindings(input.missingRequired ?? []),
    ...intakeConflictFindings(input.ambiguousFields ?? {}),
    ...scanBannedPhrases(input.texts ?? {}, standards)
  ];

  // Stable worst-first ordering; keep insertion order within a severity band.
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity];
      return bySeverity !== 0 ? bySeverity : a.index - b.index;
    })
    .map((entry) => entry.finding);
}

/** Convenience: does any finding block approval (severity 'block')? */
export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'block');
}

/**
 * Auto-approve gate (L3): a run's output is "clean" — safe to settle without a human — when no finding
 * needs attention, i.e. none is `block` (missing-required) or `warn` (banned phrase / intake conflict).
 * Info-level style hints are tolerated; an operator raises a rule's severity to make it gate.
 */
export function isAutoApprovable(findings: Finding[]): boolean {
  return findings.every((finding) => finding.severity === 'info');
}
