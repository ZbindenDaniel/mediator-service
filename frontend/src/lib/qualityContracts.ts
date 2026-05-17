import type { QualityContract, QualityQuestion } from '../../../models/quality-contract';
import { fetchQualityContract } from './contractsApi';

export async function loadContractsAsync(subCategory?: number): Promise<{
  general: QualityContract | null;
  subCat: QualityContract | null;
}> {
  const [general, subCat] = await Promise.all([
    fetchQualityContract('general'),
    subCategory !== undefined ? fetchQualityContract(subCategory) : Promise.resolve(null)
  ]);
  return { general, subCat };
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
  general: QualityContract | null,
  subCat: QualityContract | null
): QualityQuestion[] {
  const base = general?.questions ?? [];
  return subCat ? [...base, ...subCat.questions] : base;
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
