import type { QualityContract, QualityGrading, QualityKnockout, QualityQuestion } from './quality-contract';
import type { AssemblyContract, AssemblyPart } from './assembly-contract';
import { isSlotExcludedAnswer, isSlotMissingAnswer } from './assembly-contract';
import { QUALITY_LABELS } from './quality';

/**
 * The one quality calculation (backend store, intake, live preview).
 *
 * Every scored component — a question, or an assembly slot with `weight` — adds its weight to `total`.
 * What has been checked adds `weight × fraction` to `certain` and `possible`; an unanswered question
 * adds its full weight to `possible` only. A weighted slot counts only once it has been looked at. Quality is the range certain/total … possible/total.
 * Example: webcam 3 (3/3), hinges 4 (3/4), keyboard 5 (unchecked), mainboard 8 (6/8) → 60–85 %.
 *
 * Answers become fractions through named states ("Gut" 0.75, "Kaputt" 0 — the contract scale, or a
 * per-question override). A knock-out caps the whole item when a component is certainly below its
 * threshold (swollen battery → at most "Ersatzteil"), so a safety defect cannot drown in the average.
 * The 1–5 grade is derived pessimistically from the lower bound, and only when the range is narrow.
 */
export interface QualityScore {
  total: number;
  certain: number;
  possible: number;
  /** Lowest knock-out cap that applies, or null. */
  cap: number | null;
}

/** Stored/transported form: fractions 0–1 of the original quality. */
export interface QualityScoreRange {
  min: number;
  max: number;
}

export interface QualityScoreChild {
  slotKey: string | null;
  /** true while the part is still in the device (BoxID null) */
  inDevice: boolean;
  /** the child's own range, or null when it has no score yet */
  score: QualityScoreRange | null;
}

export interface QualityScoreInput {
  contracts: QualityContract[];
  answers: Record<string, string>;
  assembly?: AssemblyContract | null;
  children?: QualityScoreChild[];
  /** Named states; defaults to the `scale` of any contract in `contracts` (general.json carries it). */
  scale?: Record<string, number | null>;
}

/** Used when general.json carries no `grading` (bands per U3, 2026-10-14). */
export const DEFAULT_QUALITY_GRADING: QualityGrading = {
  bands: [
    { min: 0.8, value: 5 },
    { min: 0.6, value: 4 },
    { min: 0.4, value: 3 },
    { min: 0.2, value: 2 },
    { min: 0, value: 1 }
  ],
  maxUncertainty: 0.25
};

const EMPTY: QualityScore = { total: 0, certain: 0, possible: 0, cap: null };

function minCap(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function add(a: QualityScore, b: QualityScore): QualityScore {
  return { total: a.total + b.total, certain: a.certain + b.certain, possible: a.possible + b.possible, cap: minCap(a.cap, b.cap) };
}

function isPositiveWeight(w: unknown): w is number {
  return typeof w === 'number' && Number.isFinite(w) && w > 0;
}

function isVisible(question: QualityQuestion, answers: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.value;
}

/** Parses a multi answer. undefined = not checked; [] = checked, nothing found. */
export function parseMultiAnswer(answer: string | undefined): string[] | undefined {
  if (answer === undefined || answer.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(answer);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  } catch {
    // fall through — a non-JSON value is treated as a single entry so hand-edited data is not lost
  }
  return [answer];
}

/** Count-threshold impact of a multi question: highest key ≤ count wins; below the lowest → 5. */
export function multiImpact(impact: Record<string, number> | undefined, count: number): number | undefined {
  if (!impact) return undefined;
  let best: { threshold: number; value: number } | null = null;
  for (const [key, value] of Object.entries(impact)) {
    const threshold = Number.parseInt(key, 10);
    if (!Number.isFinite(threshold) || typeof value !== 'number') continue;
    if (threshold <= count && (!best || threshold > best.threshold)) best = { threshold, value };
  }
  return best ? best.value : 5;
}

/**
 * Legacy 1–5 impact → fraction. (v−1)/4 rather than v/5: "broken" (1) must be worth nothing.
 * Only for overlay contracts not yet migrated to `states`.
 */
export function impactToFraction(impact: number): number {
  return Math.max(0, Math.min(1, (impact - 1) / 4));
}

/** True when the question takes part in the score at all (spec-only questions like "RAM?" do not). */
export function isScoredQuestion(question: QualityQuestion): boolean {
  return isPositiveWeight(question.weight) || !!question.states || !!question.qualityImpact;
}

type Fraction = number | null | undefined; // number = value, null = excluded, undefined = unknown

function lookupState(question: QualityQuestion, key: string, scale: Record<string, number | null>): Fraction {
  if (question.states && key in question.states) return question.states[key];
  if (key in scale) return scale[key];
  const legacy = (question.qualityImpact as Record<string, number> | undefined)?.[key];
  return typeof legacy === 'number' ? impactToFraction(legacy) : undefined;
}

function answerFraction(question: QualityQuestion, answer: string, scale: Record<string, number | null>): Fraction {
  if (question.type === 'multi') {
    const entries = parseMultiAnswer(answer);
    if (entries === undefined) return undefined;
    // States of a multi question are keyed by entry count thresholds, like its legacy impact.
    if (question.states) {
      let best: { threshold: number; value: number | null } | null = null;
      for (const [key, value] of Object.entries(question.states)) {
        const threshold = Number.parseInt(key, 10);
        if (Number.isFinite(threshold) && threshold <= entries.length && (!best || threshold > best.threshold)) best = { threshold, value };
      }
      return best ? best.value : 1;
    }
    const impact = multiImpact(question.qualityImpact, entries.length);
    return impact === undefined ? undefined : impactToFraction(impact);
  }
  return lookupState(question, answer, scale);
}

/** Cap from a knock-out, applied only when the component is certainly below its threshold. */
function knockoutCap(knockout: QualityKnockout | undefined, max: number): number | null {
  if (!knockout) return null;
  return max < knockout.below ? knockout.cap : null;
}

function questionScore(question: QualityQuestion, answers: Record<string, string>, scale: Record<string, number | null>): QualityScore {
  if (!isScoredQuestion(question) || !isVisible(question, answers)) return EMPTY;
  const w = isPositiveWeight(question.weight) ? question.weight : 1;
  const answer = answers[question.id];
  const fraction = answer === undefined || answer.trim() === '' ? undefined : answerFraction(question, answer, scale);
  if (fraction === null) return EMPTY;
  // Unanswered, or an answer without a value ("Ungetestet", "?"), is uncertainty, not a value.
  if (fraction === undefined) return { total: w, certain: 0, possible: w, cap: null };
  return { total: w, certain: w * fraction, possible: w * fraction, cap: knockoutCap(question.knockout, fraction) };
}

// A weighted slot counts only once it has been looked at: a part with its own range in it, the part
// removed, or the slot answered missing. "Vorhanden" without an assessed part, an unanswered slot and
// "Nicht vorgesehen"/"Fest verbaut" stay out of the score — otherwise starting to take a device apart
// would widen its range (every ticked slot adds uncertainty) and drop the grade it got at creation.
function slotScore(part: AssemblyPart, answers: Record<string, string>, children: QualityScoreChild[]): QualityScore {
  const w = part.weight as number;
  const linked = children.filter((c) => c.slotKey === part.key);
  const inDevice = linked.filter((c) => c.inDevice);
  if (inDevice.length > 0) {
    // multipleAllowed slots (RAM): the slot is worth the average of its assessed instances
    const assessed = inDevice.filter((c) => c.score !== null);
    if (assessed.length === 0) return EMPTY;
    const min = assessed.reduce((sum, c) => sum + c.score!.min, 0) / assessed.length;
    const max = assessed.reduce((sum, c) => sum + c.score!.max, 0) / assessed.length;
    return { total: w, certain: w * min, possible: w * max, cap: knockoutCap(part.knockout, max) };
  }
  // Removed to a box = gone from this device; its value now belongs to the part itself.
  if (linked.length > 0) return { total: w, certain: 0, possible: 0, cap: knockoutCap(part.knockout, 0) };
  const answer = part.question ? answers[part.question.id] : undefined;
  if (isSlotMissingAnswer(answer)) return { total: w, certain: 0, possible: 0, cap: knockoutCap(part.knockout, 0) };
  return EMPTY;
}

/** Slot keys whose part now speaks for itself (assessed, removed or missing) — see `refinedBy`. */
function refinedSlotKeys(parts: AssemblyPart[], answers: Record<string, string>, children: QualityScoreChild[]): Set<string> {
  const keys = new Set<string>();
  for (const part of parts) {
    const linked = children.filter((c) => c.slotKey === part.key);
    const inDevice = linked.filter((c) => c.inDevice);
    const answer = part.question ? answers[part.question.id] : undefined;
    const refined = inDevice.length > 0
      ? inDevice.some((c) => c.score !== null)
      : linked.length > 0 || isSlotMissingAnswer(answer);
    if (refined) keys.add(part.key);
  }
  return keys;
}

/**
 * Device questions whose parts now speak for themselves (S1): every slot in `refinedBy` is assessed,
 * removed or missing. They leave the score, and the forms lock them — a general answer given before
 * the device was taken apart must not contradict (or be edited against) the parts' own assessments.
 * A covered slot that is "Fest verbaut"/"Nicht vorgesehen" never refines, so such a question stays.
 */
export function refinedQuestionIds(input: Pick<QualityScoreInput, 'contracts' | 'answers' | 'assembly' | 'children'>): Set<string> {
  const weightedParts = (input.assembly?.parts ?? []).filter((p) => isPositiveWeight(p.weight));
  const refined = refinedSlotKeys(weightedParts, input.answers, input.children ?? []);
  const ids = new Set<string>();
  for (const contract of input.contracts) {
    for (const question of contract.questions) {
      if (question.refinedBy?.length && question.refinedBy.every((key) => refined.has(key))) ids.add(question.id);
    }
  }
  return ids;
}

export function computeQualityScore(input: QualityScoreInput): QualityScore {
  const { contracts, answers, assembly, children = [] } = input;
  const scale = input.scale ?? contracts.find((c) => c.scale)?.scale ?? {};
  const weightedParts = (assembly?.parts ?? []).filter((p) => isPositiveWeight(p.weight));
  // A weighted slot is scored through the slot; its presence question must not count twice.
  const slotQuestionIds = new Set(weightedParts.map((p) => p.question?.id).filter(Boolean));
  const refined = refinedQuestionIds(input);
  const seen = new Set<string>();
  let score = EMPTY;
  for (const contract of contracts) {
    for (const question of contract.questions) {
      if (slotQuestionIds.has(question.id) || seen.has(question.id) || refined.has(question.id)) continue;
      seen.add(question.id);
      score = add(score, questionScore(question, answers, scale));
    }
  }
  for (const part of weightedParts) score = add(score, slotScore(part, answers, children));
  return score;
}

/** null when nothing is scored. A knock-out cap lowers both bounds. */
export function scoreToRange(score: QualityScore): QualityScoreRange | null {
  if (!(score.total > 0)) return null;
  let min = score.certain / score.total;
  let max = score.possible / score.total;
  if (score.cap !== null) {
    min = Math.min(min, score.cap);
    max = Math.min(max, score.cap);
  }
  return { min, max };
}

/** Pessimistic 1–5 grade from the lower bound; null when the range is too wide to say anything. */
export function gradeFromRange(range: QualityScoreRange | null, grading: QualityGrading = DEFAULT_QUALITY_GRADING): number | null {
  if (!range) return null;
  // epsilon: float sums like 0.1 + 0.15 must not tip a 0.25-wide range over the limit
  if (range.max - range.min > grading.maxUncertainty + 1e-9) return null;
  const bands = [...grading.bands].sort((a, b) => b.min - a.min);
  for (const band of bands) {
    if (range.min >= band.min - 1e-9) return band.value;
  }
  return bands.length ? bands[bands.length - 1].value : null;
}

export function gradingFrom(contracts: QualityContract[]): QualityGrading {
  return contracts.find((c) => c.grading)?.grading ?? DEFAULT_QUALITY_GRADING;
}

export function gradeLabel(grade: number | null): string | null {
  return grade === null ? null : QUALITY_LABELS[grade] ?? null;
}

/** "60–85 %" or "72 %" when certain. */
export function formatQualityScoreRange(range: QualityScoreRange | null | undefined): string {
  if (!range) return '–';
  const lo = Math.round(range.min * 100);
  const hi = Math.round(range.max * 100);
  return lo === hi ? `${lo} %` : `${lo}–${hi} %`;
}
