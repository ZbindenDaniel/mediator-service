import type { QualityContract, QualityQuestion } from '../../../models/quality-contract';
import type { DisassemblyContract } from '../../../models/disassembly-contract';
import { fetchQualityContract, fetchDisassemblyContract } from './contractsApi';

export function isQuestionVisible(question: QualityQuestion, answers: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.value;
}

/** Converts disassembly contract part questions into a synthetic QualityContract for rendering/scoring. */
function disassemblyToQualityContract(dc: DisassemblyContract): QualityContract {
  return {
    version: dc.version,
    subCategory: dc.subCategory,
    questions: dc.parts.flatMap(p => p.qualityQuestion ? [p.qualityQuestion] : [])
  };
}

export async function loadContractsAsync(subCategory?: number): Promise<{
  general: QualityContract | null;
  disassembly: QualityContract | null;
  subCat: QualityContract | null;
}> {
  const [general, disassemblyRaw, subCat] = await Promise.all([
    fetchQualityContract('general'),
    subCategory !== undefined ? fetchDisassemblyContract(subCategory) : Promise.resolve(null),
    subCategory !== undefined ? fetchQualityContract(subCategory) : Promise.resolve(null)
  ]);
  const disassembly = disassemblyRaw ? disassemblyToQualityContract(disassemblyRaw) : null;
  return { general, disassembly, subCat };
}

/** Derives quality value (1–5) from answers across all provided contracts. */
export function deriveQualityFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>
): number {
  const scores: number[] = [];
  for (const contract of contracts) {
    for (const question of contract.questions) {
      if (!isQuestionVisible(question, answers)) continue;
      if (!question.qualityImpact) continue;
      const answer = answers[question.id];
      if (answer === undefined) continue;
      const impact = (question.qualityImpact as Record<string, number>)[answer];
      if (typeof impact === 'number') scores.push(impact);
    }
  }
  return scores.length > 0 ? Math.min(...scores) : 3;
}

/** Returns all questions from all contracts in order: general → disassembly → subcategory. */
export function getAllQuestions(
  general: QualityContract | null,
  subCat: QualityContract | null,
  disassembly?: QualityContract | null
): QualityQuestion[] {
  return [
    ...(general?.questions ?? []),
    ...(disassembly?.questions ?? []),
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
