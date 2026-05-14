export type QualityQuestionType = 'select' | 'boolean';

export interface SelectQuestion {
  id: string;
  type: 'select';
  question: string;
  values: string[];
  required?: boolean;
  /** If set, contributes this key to Spezifikationen after the check */
  specField?: string;
  /** Template string; %v is replaced by the selected answer, e.g. "%v GB" */
  specValue?: string;
  /** Maps answer values to a quality impact score (1–5); final quality = min of all mapped answers */
  qualityImpact?: Record<string, number>;
}

export interface BooleanQuestion {
  id: string;
  type: 'boolean';
  question: string;
  required?: boolean;
  specField?: string;
  specValue?: string;
  qualityImpact?: Record<'true' | 'false', number>;
}

export type QualityQuestion = SelectQuestion | BooleanQuestion;

export interface QualityContract {
  version: number;
  /** Absent = general contract (applies to all items) */
  subCategory?: number;
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
}
