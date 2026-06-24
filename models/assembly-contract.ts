import type { QualityQuestion } from './quality-contract';

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
  /** @deprecated use question */
  qualityQuestion?: QualityQuestion;
}

export interface AssemblyContract {
  version: number;
  subCategory: number;
  parts: AssemblyPart[];
}

// Backward-compatibility aliases for code not yet migrated
