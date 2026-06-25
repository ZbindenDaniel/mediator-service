import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { QualityContract, QualityQuestion, QualityCheckResponse } from '../../models/quality-contract';
import type { AssemblyContract } from '../../models/assembly-contract';
import { QUALITY_DEFAULT, QUALITY_MIN, QUALITY_MAX, QUALITY_LABELS } from '../../models/quality';
import type { QualityTag } from '../../models/quality';

// __dirname is reliable across dev and dist; process.cwd() varies by launch directory
const CONTRACTS_DIR = resolve(__dirname, '../../contracts/quality');

function loadContractFile(filename: string): QualityContract | null {
  try {
    const raw = readFileSync(join(CONTRACTS_DIR, filename), 'utf-8');
    return JSON.parse(raw) as QualityContract;
  } catch {
    return null;
  }
}

export function loadGeneralContract(): QualityContract {
  const contract = loadContractFile('general.json');
  if (!contract) throw new Error('General quality contract not found');
  return contract;
}

export function loadSubCategoryContract(subCatCode: number): QualityContract | null {
  return loadContractFile(`${subCatCode}.json`);
}

function clamp(value: number): number {
  return Math.max(QUALITY_MIN, Math.min(QUALITY_MAX, value));
}

function isQuestionVisible(question: QualityQuestion, answers: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.value;
}

function tagForValue(value: number): QualityTag {
  const label = QUALITY_LABELS[value];
  if (!label) return QUALITY_LABELS[QUALITY_DEFAULT] as QualityTag;
  return label as QualityTag;
}

/** Derives quality value (1–5) from contract answers. Worst (min) impact score wins. */
export function deriveQualityFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>
): { value: number; tag: QualityTag } {
  const scores: number[] = [];

  for (const contract of contracts) {
    for (const question of contract.questions) {
      if (!isQuestionVisible(question, answers)) continue;
      if (!question.qualityImpact) continue;
      const answer = answers[question.id];
      if (answer === undefined) continue;
      const impact = question.qualityImpact[answer as keyof typeof question.qualityImpact];
      if (typeof impact === 'number') scores.push(impact);
    }
  }

  const value = scores.length > 0 ? clamp(Math.min(...scores)) : QUALITY_DEFAULT;
  return { value, tag: tagForValue(value) };
}

/** Builds the derived Spezifikationen entries from contract answers. */
export function deriveSpecsFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>
): Record<string, string> {
  const specs: Record<string, string> = {};

  for (const contract of contracts) {
    for (const question of contract.questions) {
      if (!isQuestionVisible(question, answers)) continue;
      if (!question.specField) continue;
      const answer = answers[question.id];
      if (answer === undefined) continue;
      const rendered = question.specValue ? question.specValue.replace('%v', answer) : answer;
      specs[question.specField] = rendered;
    }
  }

  return specs;
}

/** Converts assembly contract part questions into a synthetic QualityContract for scoring/spec derivation. */
export function assemblyToQualityContract(ac: AssemblyContract): QualityContract {
  return {
    version: ac.version,
    subCategory: ac.subCategory,
    // Include both primary question and secondary specQuestion so all specs are derived
    questions: ac.parts.flatMap(p => {
      const q = p.question; // support both field names
      const sq = p.specQuestion;
      return [
        ...(q ? [q] : []),
        ...(sq ? [sq] : [])
      ];
    })
  };
}


export function buildQualityCheckResponse(
  generalContract: QualityContract,
  subCatContract: QualityContract | null,
  answers: Record<string, string>,
  assemblyQualityContract?: QualityContract | null
): QualityCheckResponse {
  const contracts = [
    generalContract,
    ...(assemblyQualityContract ? [assemblyQualityContract] : []),
    ...(subCatContract ? [subCatContract] : [])
  ];
  const { value, tag } = deriveQualityFromAnswers(contracts, answers);
  const derivedSpecs = deriveSpecsFromAnswers(contracts, answers);

  return {
    generalContractVersion: generalContract.version,
    ...(subCatContract ? { subCategoryContractVersion: subCatContract.version } : {}),
    ...(subCatContract?.subCategory !== undefined ? { subCategory: subCatContract.subCategory } : {}),
    answers,
    derivedSpecs,
    qualityValue: value,
    qualityTag: tag,
  };
}
