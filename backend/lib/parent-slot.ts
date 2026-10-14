import { execute, queryOne } from '../db-client';
import { insertQualityAssessment, updateItemQualityAssessment } from '../db';
import { getAssemblyContract } from '../contracts/registry';
import { loadGeneralContract, loadSubCategoryContract, buildQualityCheckResponse, assemblyToQualityContract } from './quality-contracts';
import { resolveEffectiveSubCategory, recomputeQualityScoreSafely } from './quality-score';
import type { RecomputeOptions } from './quality-score';
import { SLOT_MISSING } from '../../models/assembly-contract';
import type { QualityTag } from '../../models/quality';

// A part left its parent device (Entnehmen). Instead of overwriting the parent's grade with a bare
// "Ersatzteil" assessment (which also threw away every answer), the parent's last answers are carried
// over with that slot set to "missing", and the normal calculation decides. Whether the device is
// additionally marked as a spare-part donor is contract-driven: unweighted slots (refurbishment
// contracts) keep the historical "grade 1", weighted slots (catalogue) are left to the score.

export interface PartLeftParentResult {
  markedSpare: boolean;
  assessmentId: number | null;
}

async function loadAnswers(parentUuid: string): Promise<Record<string, string>> {
  const row = await queryOne<{ responses: unknown }>(
    `SELECT qa.responses FROM items i JOIN quality_assessments qa ON qa.id = i."QualityId" WHERE i."ItemUUID" = $1`,
    [parentUuid]
  );
  if (!row || typeof row.responses !== 'string') return {};
  try {
    const parsed = JSON.parse(row.responses) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function recordPartLeftParent(
  parentUuid: string,
  slotKey: string | null,
  actor: string,
  opts: { markParentAsSpare?: boolean; note?: string } & RecomputeOptions = {}
): Promise<PartLeftParentResult> {
  const subCategory = await resolveEffectiveSubCategory(parentUuid);
  const assembly = subCategory !== null ? getAssemblyContract(subCategory) : null;
  const part = slotKey ? assembly?.parts.find((p) => p.key === slotKey) : undefined;
  let assessmentId: number | null = null;

  const q = part?.question;
  const missingValue = q?.type === 'boolean' ? 'false' : q?.type === 'select' && q.values.includes(SLOT_MISSING) ? SLOT_MISSING : null;
  if (q && missingValue && subCategory !== null && assembly) {
    const previous = await loadAnswers(parentUuid);
    if (previous[q.id] !== missingValue) {
      const answers = { ...previous, [q.id]: missingValue };
      const checkResponse = buildQualityCheckResponse(
        loadGeneralContract(),
        loadSubCategoryContract(subCategory),
        answers,
        assemblyToQualityContract(assembly),
        assembly
      );
      assessmentId = await insertQualityAssessment({
        tag: checkResponse.qualityTag as QualityTag,
        value: checkResponse.qualityValue,
        is_complete: false,
        has_defects: null,
        is_functional: null,
        notes: opts.note ?? `Bauteil entnommen (${part?.label ?? slotKey})`,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor,
        checkResponse
      });
      await updateItemQualityAssessment(parentUuid, assessmentId, checkResponse.qualityValue);
    }
  }

  const markedSpare = opts.markParentAsSpare ?? !(part && typeof part.weight === 'number' && part.weight > 0);
  if (markedSpare) {
    await execute(`UPDATE items SET "Quality" = 1, "QualityManual" = TRUE WHERE "ItemUUID" = $1`, [parentUuid]);
  }
  await recomputeQualityScoreSafely(parentUuid, opts);
  return { markedSpare, assessmentId };
}
