export type QualityQuestionType = 'select' | 'boolean' | 'text' | 'multi';

/** Makes a question conditionally visible based on another question's answer. */
export interface ShowIfCondition {
  /** ID of another question whose answer controls visibility */
  questionId: string;
  /** Show this question only when that question's answer equals this value */
  value: string;
}

/**
 * Intake-only auto-resolution fields, declared per question in the contract JSON so the intake
 * questionnaire stays short without hardcoding anything in code:
 *   • `autoFill` binds the question to a named scan signal (ram / storageSize / storageType /
 *     battery); when the scan yields a value the server auto-answers it and does NOT ask.
 *   • `skipAtIntake` means "a booted device implies this" — assume present, don't ask.
 * Both are ignored outside intake (the operator quality review still asks everything).
 */
export interface IntakeResolveFields {
  autoFill?: string;
  skipAtIntake?: boolean;
}

/** If a component scores below `below` (fraction 0–1), the whole item is capped at `cap`. */
export interface QualityKnockout {
  below: number;
  cap: number;
}

/**
 * Scoring fields (models/quality-score.ts). A question takes part in the quality score when it has
 * a `weight`, `states` or (legacy) `qualityImpact`; the weight then defaults to 1.
 */
export interface WeightedQuestionFields {
  /** Importance of this question relative to the others of the item. */
  weight?: number;
  /**
   * Answer → fraction of full quality (0–1). Answers not listed fall back to the contract scale
   * (`scale` in general.json); `null` = this answer excludes the question ("Nicht zutreffend");
   * an answer with no value anywhere ("Ungetestet", "?") counts as uncertainty.
   */
  states?: Record<string, number | null>;
  knockout?: QualityKnockout;
  /**
   * Assembly slot keys (of the same item's assembly contract) this device-level question is a
   * stand-in for, e.g. "Gehäuse-Zustand" → ["palmrest", "bottom_case"]. Once every listed slot is
   * assessed or missing, the parts speak for that area and this question leaves the score (S1).
   */
  refinedBy?: string[];
}

export interface SelectQuestion extends IntakeResolveFields, WeightedQuestionFields {
  id: string;
  type: 'select';
  question: string;
  values: string[];
  required?: boolean;
  /** If set, contributes this key to Spezifikationen after the check */
  specField?: string;
  /** Template string; %v is replaced by the selected answer, e.g. "%v GB" */
  specValue?: string;
  /** @deprecated use `states`. Legacy 1–5 per answer; read as fraction (v−1)/4 when no state matches. */
  qualityImpact?: Record<string, number>;
  /** Only show this question when the referenced question has the specified answer */
  showIf?: ShowIfCondition;
}

export interface BooleanQuestion extends IntakeResolveFields, WeightedQuestionFields {
  id: string;
  type: 'boolean';
  question: string;
  required?: boolean;
  specField?: string;
  specValue?: string;
  qualityImpact?: Record<'true' | 'false', number>;
  /** Only show this question when the referenced question has the specified answer */
  showIf?: ShowIfCondition;
}

export interface TextQuestion extends IntakeResolveFields, WeightedQuestionFields {
  id: string;
  type: 'text';
  question: string;
  required?: boolean;
  specField?: string;
  specValue?: string;
  qualityImpact?: Record<string, number>;
  /** Common options surfaced as datalist suggestions; the user may still type anything */
  suggestions?: string[];
  showIf?: ShowIfCondition;
}

/**
 * Several values for one question (e.g. the missing keys of a keyboard). The answer is stored as a
 * JSON array string ('["F5",",","Ä"]') because answers are Record<string,string> and a comma can
 * itself be a value; '[]' means "checked, none", an absent/empty answer means "not checked".
 */
export interface MultiQuestion extends IntakeResolveFields, WeightedQuestionFields {
  id: string;
  type: 'multi';
  question: string;
  /** Closed list (checkboxes). Mutually exclusive with `suggestions`. */
  values?: string[];
  /** Open list (chips): common entries offered, the user may still type anything. */
  suggestions?: string[];
  required?: boolean;
  specField?: string;
  /** %v is replaced by the entries joined with ", " */
  specValue?: string;
  /**
   * Count thresholds → quality impact (1–5): the highest key ≤ number of entries applies, e.g.
   * { "1": 4, "3": 3 } = 1–2 entries → 4, 3+ → 3. Fewer entries than the lowest key → 5.
   */
  qualityImpact?: Record<string, number>;
  showIf?: ShowIfCondition;
}

export type QualityQuestion = SelectQuestion | BooleanQuestion | TextQuestion | MultiQuestion;

/** Percentage → 1–5 grade: the first band whose `min` ≤ the pessimistic (lower) bound wins. */
export interface QualityGrading {
  bands: Array<{ min: number; value: number }>;
  /** A range wider than this (max − min) gets no grade: there is no information in it. */
  maxUncertainty: number;
}

export interface QualityContract {
  version: number;
  /** Absent = general contract (applies to all items) */
  subCategory?: number;
  /** general.json only: named states → fraction, shared by every contract (e.g. "Gut": 0.75). */
  scale?: Record<string, number | null>;
  /** general.json only: how the percentage maps onto the 1–5 grade. */
  grading?: QualityGrading;
  questions: QualityQuestion[];
  /** Reserved for future document integration (e.g. wipeReport, systemTest) */
  documents?: string[];
}

/** The result of a completed quality check, saved per instance */
export interface QualityCheckResponse {
  generalContractVersion: number;
  subCategoryContractVersion?: number;
  subCategory?: number;
  /** questionId → selected value (or "true"/"false" for boolean questions) */
  answers: Record<string, string>;
  /** specField → rendered specValue, ready to merge into Langtext */
  derivedSpecs: Record<string, string>;
  qualityValue: number;
  qualityTag: string;
  /** Percentage range of this assessment's own answers (fractions 0–1), null when nothing is scored. */
  qualityScore?: { min: number; max: number } | null;
}
