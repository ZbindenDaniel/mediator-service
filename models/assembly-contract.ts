import type { QualityContract, QualityKnockout, QualityQuestion } from './quality-contract';

export interface AssemblyPart {
  key: string;
  label: string;
  targetSubcategory: number;
  multipleAllowed?: boolean;
  /** When true, this slot has no item link — spec answer is sufficient (e.g. storage). */
  noLink?: boolean;
  /** Primary question — presence (boolean) or spec (select). Used for quality scoring. */
  question?: QualityQuestion;
  /** Secondary spec question, e.g. drive_type alongside storage_gb. Not used for quality scoring. */
  specQuestion?: QualityQuestion;
  /**
   * Weight of this part in the parent's quality score (see models/quality-score.ts). A weighted
   * slot is scored by presence + the linked part's own score; an unweighted slot's question is
   * scored like any other question.
   */
  weight?: number;
  /** Weighted slots: if the part scores below `below`, the parent is capped at `cap`. */
  knockout?: QualityKnockout;
  /** Key of the work step (`AssemblyContract.steps`) in which this part is reached. */
  step?: string;
  /**
   * Presence shown pre-set until the operator answers (e.g. "Nicht vorgesehen" for a rarely fitted
   * second drive). Display-only — never stored or scored — so changing it later applies to every item.
   */
  default?: string;
}

/** One work step of taking the item apart, in the order of `AssemblyContract.steps`. */
export interface AssemblyStep {
  key: string;
  label: string;
}

/**
 * Canonical answers of a slot presence question (`part.question`, type select). Shared by the
 * Zerlegen slot state (frontend) and the quality score (both sides), so the strings live here.
 */
export const SLOT_PRESENT = 'Vorhanden' as const;
/** Part should be there but is missing — counts as 0 in the score. Boolean `false` means the same. */
export const SLOT_MISSING = 'Nicht vorhanden' as const;
/** This model never had the part (e.g. no fingerprint reader) — excluded from the score. */
export const SLOT_NOT_APPLICABLE = 'Nicht vorgesehen' as const;
/** Soldered/integrated, no separate item (e.g. BGA CPU) — excluded; its condition is asked on the parent. */
export const SLOT_INTEGRATED = 'Fest verbaut' as const;
export const SLOT_PRESENCE_VALUES = [SLOT_PRESENT, SLOT_MISSING, SLOT_NOT_APPLICABLE, SLOT_INTEGRATED] as const;

export function isSlotMissingAnswer(answer: string | undefined): boolean {
  return answer === 'false' || answer === SLOT_MISSING;
}

export function isSlotExcludedAnswer(answer: string | undefined): boolean {
  return answer === SLOT_NOT_APPLICABLE || answer === SLOT_INTEGRATED;
}

export interface AssemblyContract {
  version: number;
  subCategory: number;
  parts: AssemblyPart[];
  /** Slot keys asked when the item is created (device check). Absent = every slot, [] = none. */
  askOnCreate?: string[];
  /** Work steps for taking the item apart; parts without a step are grouped as "Weitere Teile". */
  steps?: AssemblyStep[];
}

/**
 * `all` = every slot (re-assessment); `create` = only what the device check at creation asks;
 * `none` = no slot (the Einzelteile page asks presence in its own tree, the form only the item's own questions).
 */
export type AssemblyQuestionScope = 'all' | 'create' | 'none';

export function partsInScope(ac: AssemblyContract, scope: AssemblyQuestionScope): AssemblyPart[] {
  if (scope === 'none') return [];
  if (scope === 'all' || !Array.isArray(ac.askOnCreate)) return ac.parts;
  const asked = new Set(ac.askOnCreate);
  return ac.parts.filter((p) => asked.has(p.key));
}

/**
 * The slot questions (presence + secondary spec question) as a QualityContract, for asking and
 * scoring alongside the item's own contracts. The one conversion for frontend, intake and server,
 * so the creation form and the intake station ask the same questions.
 */
export function assemblyToQualityContract(ac: AssemblyContract, scope: AssemblyQuestionScope = 'all'): QualityContract {
  return {
    version: ac.version,
    subCategory: ac.subCategory,
    questions: partsInScope(ac, scope).flatMap((p) => [
      ...(p.question ? [p.question] : []),
      ...(p.specQuestion ? [p.specQuestion] : [])
    ])
  };
}
