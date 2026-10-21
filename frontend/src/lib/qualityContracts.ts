import type { QualityContract, QualityQuestion } from '../../../models/quality-contract';
import type { AssemblyContract, AssemblyQuestionScope } from '../../../models/assembly-contract';
import { assemblyToQualityContract } from '../../../models/assembly-contract';
import { fetchQualityContract, fetchAssemblyContract } from './contractsApi';
import { computeQualityScore, scoreToRange, gradeFromRange, gradingFrom } from '../../../models/quality-score';

export function isQuestionVisible(question: QualityQuestion, answers: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.value;
}

/** `scope` limits which slot questions are asked (`create` = askOnCreate); scoring uses `assemblyRaw`. */
export async function loadContractsAsync(subCategory?: number, scope: AssemblyQuestionScope = 'all'): Promise<{
  general: QualityContract | null;
  /** The slot questions to ask in this scope. */
  assembly: QualityContract | null;
  subCat: QualityContract | null;
  /** The assembly contract as-is (slots + weights), for the percentage score preview. */
  assemblyRaw: AssemblyContract | null;
}> {
  const [general, assemblyRaw, subCat] = await Promise.all([
    fetchQualityContract('general'),
    subCategory !== undefined ? fetchAssemblyContract(subCategory) : Promise.resolve(null),
    subCategory !== undefined ? fetchQualityContract(subCategory) : Promise.resolve(null)
  ]);
  const assembly = assemblyRaw ? assemblyToQualityContract(assemblyRaw, scope) : null;
  return { general, assembly, subCat, assemblyRaw: assemblyRaw ?? null };
}

/**
 * Pessimistic 1–5 grade of the answers alone (same as the server's assessment value): the band of
 * the lower bound, 3 when nothing is scored. The item's displayed grade also checks the range width.
 */
export function deriveQualityFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>,
  assembly?: AssemblyContract | null
): number {
  const range = scoreToRange(computeQualityScore({ contracts, answers, assembly }));
  if (!range) return 3;
  return gradeFromRange({ min: range.min, max: range.min }, gradingFrom(contracts)) ?? 3;
}

/** Returns all questions from all contracts in order: general → assembly → subcategory. */
export function getAllQuestions(
  general: QualityContract | null,
  subCat: QualityContract | null,
  assembly?: QualityContract | null
): QualityQuestion[] {
  return [
    ...(general?.questions ?? []),
    ...(assembly?.questions ?? []),
    ...(subCat?.questions ?? [])
  ];
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
