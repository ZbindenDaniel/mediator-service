import type { QualityQuestion } from './quality-contract';

export interface DisassemblyContractPart {
  key: string;
  label: string;
  targetSubcategory: number;
  qualityQuestion?: QualityQuestion;
}

export interface DisassemblyContract {
  version: number;
  subCategory: number;
  parts: DisassemblyContractPart[];
}
