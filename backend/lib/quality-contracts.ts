import { readFileSync } from 'fs';
import { join } from 'path';
import type { QualityContract, QualityQuestion, QualityCheckResponse } from '../../models/quality-contract';
import type { AssemblyContract } from '../../models/assembly-contract';
import { assemblyToQualityContract } from '../../models/assembly-contract';
import { QUALITY_DEFAULT, QUALITY_MIN, QUALITY_MAX, QUALITY_LABELS } from '../../models/quality';
import type { QualityTag } from '../../models/quality';
import { resolveContractReadPath } from '../contracts/paths';
import { getAssemblyContract, getQualityContract } from '../contracts/registry';
import { parseMultiAnswer, computeQualityScore, scoreToRange, gradeFromRange, gradingFrom } from '../../models/quality-score';
import type { QualityScoreRange } from '../../models/quality-score';

function loadContractFile(filename: string): QualityContract | null {
  try {
    // Overlay-first (CONTRACTS_OVERLAY_DIR), else the shipped contracts/quality default.
    const raw = readFileSync(resolveContractReadPath(join('quality', filename)), 'utf-8');
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

// Includes the shared Hauptkategorie contract (group-<haupt>.json), see registry.getQualityContract.
export function loadSubCategoryContract(subCatCode: number): QualityContract | null {
  return getQualityContract(subCatCode);
}

/**
 * The questions of the device check at creation (intake station): general + subcategory + the slots
 * the assembly contract asks on create (`askOnCreate`, absent = all). Scoring still uses every slot.
 */
export function loadCreationQuestions(subCatCode: number | null): QualityQuestion[] {
  const general = loadGeneralContract();
  const subCat = subCatCode ? loadSubCategoryContract(subCatCode) : null;
  const assembly = subCatCode ? getAssemblyContract(subCatCode) : null;
  return [
    ...general.questions,
    ...(subCat?.questions ?? []),
    ...(assembly ? assemblyToQualityContract(assembly, 'create').questions : [])
  ];
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

/**
 * Quality of one assessment from its own answers (models/quality-score.ts). `value` is the
 * pessimistic grade ("at least …") of the lower bound, so an assessment row always has one; whether
 * the item shows a grade at all (narrow enough range) is decided when the item is recomputed.
 */
export function deriveQualityFromAnswers(
  contracts: QualityContract[],
  answers: Record<string, string>,
  assembly?: AssemblyContract | null
): { value: number; tag: QualityTag; range: QualityScoreRange | null } {
  const range = scoreToRange(computeQualityScore({ contracts, answers, assembly }));
  if (!range) return { value: QUALITY_DEFAULT, tag: tagForValue(QUALITY_DEFAULT), range: null };
  const grading = gradingFrom(contracts);
  const value = clamp(gradeFromRange({ min: range.min, max: range.min }, grading) ?? QUALITY_DEFAULT);
  return { value, tag: tagForValue(value), range };
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
      // A skipped ("don't know") answer must not become a spec — otherwise specValue "%v GB"
      // renders as " GB". An empty/whitespace answer is treated as unanswered.
      if (answer === undefined || answer.trim() === '') continue;
      let value = answer;
      if (question.type === 'multi') {
        const entries = parseMultiAnswer(answer);
        // "[]" = checked, nothing found — no spec line ("Fehlende Tasten: " would read as a defect)
        if (!entries || entries.length === 0) continue;
        value = entries.join(', ');
      }
      const rendered = question.specValue ? question.specValue.replace('%v', value) : value;
      specs[question.specField] = rendered;
    }
  }

  return specs;
}

/** Converts assembly contract part questions into a synthetic QualityContract for scoring/spec derivation. */
export function buildQualityCheckResponse(
  generalContract: QualityContract,
  subCatContract: QualityContract | null,
  answers: Record<string, string>,
  assemblyQualityContract?: QualityContract | null,
  assembly?: AssemblyContract | null
): QualityCheckResponse {
  const contracts = [
    generalContract,
    ...(assemblyQualityContract ? [assemblyQualityContract] : []),
    ...(subCatContract ? [subCatContract] : [])
  ];
  const { value, tag, range } = deriveQualityFromAnswers(contracts, answers, assembly);
  const derivedSpecs = deriveSpecsFromAnswers(contracts, answers);

  return {
    generalContractVersion: generalContract.version,
    ...(subCatContract ? { subCategoryContractVersion: subCatContract.version } : {}),
    ...(subCatContract?.subCategory !== undefined ? { subCategory: subCatContract.subCategory } : {}),
    answers,
    derivedSpecs,
    qualityValue: value,
    qualityTag: tag,
    qualityScore: range,
  };
}
