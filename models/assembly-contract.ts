import type { QualityKnockout, QualityQuestion } from './quality-contract';

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
}
