// Review findings model — the load-bearing primitive for "review by exception".
//
// A run produces the enriched data AND a list of findings: specific, checkable things the machine
// wants a human to look at. Fields with no finding are considered verified and stay out of the
// reviewer's way. Findings are produced by rule-checkers (deterministic here; the supervisor LLM
// later) and consumed by the review UI + the auto-approve gate (zero findings ⇒ clearly good).

export type FindingType =
  | 'banned_phrase' // copied/marketing text not wanted in a second-hand shop (source-text leakage)
  | 'missing_required' // a required spec-contract field is empty
  | 'intake_conflict' // extracted value disagrees with the measured intake value
  | 'standards'; // generic standards violation (reserved for the supervisor-emitted findings later)

// block = must be resolved before approval; warn = should be looked at; info = surfaced, non-gating.
export type FindingSeverity = 'block' | 'warn' | 'info';

// What the reviewer is asked to do — keeps review a bounded decision, not open-ended inspection.
export type FindingAsk =
  | 'confirm' // "is this right?" yes/no
  | 'choose' // pick between candidate values (e.g. extracted vs. intake)
  | 'fix' // edit the value (e.g. remove a banned phrase, fill a missing field)
  | 'drop'; // remove the field/value entirely

export interface Finding {
  type: FindingType;
  severity: FindingSeverity;
  /** The field this finding concerns (a spec key or a top-level field like Artikelbeschreibung); null = whole-item. */
  field: string | null;
  /** Human-readable, German-facing statement shown to the reviewer. */
  message: string;
  /** The snippet/value that triggered the finding (e.g. the matched phrase, the intake value). */
  evidence?: string | null;
  /** A proposed value/action (e.g. the intake candidate, or "" to drop). */
  suggestion?: string | null;
  ask: FindingAsk;
  /** Which standards rule fired — carried so decisions can be measured per rule (kept vs. overturned). */
  ruleId?: string | null;
}

// --- Standards rule set (contracts/standards.json) --------------------------------------------
// Runtime-editable "house rules" for content shape. The deterministic half lives here; judgment
// rules (tone/coherence) are injected into the supervisor prompt in a later slice. Read fresh via
// the registry so an operator edit takes effect without a redeploy.

export interface BannedPhraseRule {
  /** Stable id used for measurement + de-dup; also the ruleId on emitted findings. */
  id: string;
  /** The phrase to detect. Case-insensitive substring by default; a regex when `regex` is true. */
  pattern: string;
  /** Treat `pattern` as a JS regex (case-insensitive) instead of a plain substring. */
  regex?: boolean;
  /** Reviewer-facing explanation of why this is flagged. */
  message: string;
  /** Which text fields to scan; omit to scan all provided text fields. */
  fields?: string[];
  /** Finding severity (default 'warn'). */
  severity?: FindingSeverity;
}

export interface StandardsContract {
  version: number;
  bannedPhrases?: BannedPhraseRule[];
}
