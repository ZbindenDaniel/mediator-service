import type { QualityContract, QualityQuestion } from '../../../models/quality-contract';

// Statically bundled contracts — add new subcategory files here as they are created
import generalContractJson from '../../../contracts/quality/general.json';
import contract201Json from '../../../contracts/quality/201.json';
import contract301Json from '../../../contracts/quality/301.json';
import contract701Json from '../../../contracts/quality/701.json';

const GENERAL_CONTRACT = generalContractJson as QualityContract;

const SUBCATEGORY_CONTRACTS: Partial<Record<number, QualityContract>> = {
  201: contract201Json as QualityContract,
  301: contract301Json as QualityContract,
  701: contract701Json as QualityContract,
};

export function loadContracts(subCategory?: number): {
  general: QualityContract;
  subCat: QualityContract | null;
} {
  return {
    general: GENERAL_CONTRACT,
    subCat: subCategory !== undefined ? (SUBCATEGORY_CONTRACTS[subCategory] ?? null) : null,
  };
}

/** Derives quality value (1–5) from answers across all provided contracts. */
export function deriveQualityFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>
): number {
  const scores: number[] = [];
  for (const contract of contracts) {
    for (const question of contract.questions) {
      if (!question.qualityImpact) continue;
      const answer = answers[question.id];
      if (answer === undefined) continue;
      const impact = (question.qualityImpact as Record<string, number>)[answer];
      if (typeof impact === 'number') scores.push(impact);
    }
  }
  return scores.length > 0 ? Math.min(...scores) : 3;
}

/** Returns all questions from all contracts in order: general first, then subcategory. */
export function getAllQuestions(
  general: QualityContract,
  subCat: QualityContract | null
): QualityQuestion[] {
  return subCat ? [...general.questions, ...subCat.questions] : general.questions;
}

/** Checks whether all required questions have been answered. */
export function allRequiredAnswered(
  questions: QualityQuestion[],
  answers: Record<string, string>
): boolean {
  return questions
    .filter((q) => q.required)
    .every((q) => answers[q.id] !== undefined && answers[q.id] !== '');
}
