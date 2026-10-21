import type { IncomingMessage, ServerResponse } from 'http';
import { assemblyToQualityContract } from '../../models/assembly-contract';
import type { AssemblyContract } from '../../models/assembly-contract';
import { defineHttpAction } from './index';
import { insertQualityAssessment, updateItemQualityAssessment, updateItemInstanceSpecs, getItemQualityResponses, updateQualityAssessmentAnswers } from '../db';
import {
  loadGeneralContract,
  loadSubCategoryContract,
  buildQualityCheckResponse,
  lockedSpecsFromAnswers,
} from '../lib/quality-contracts';
import { getAssemblyContract } from '../contracts/registry';
import { resolveActor } from '../utils/actor';
import { guardWrite } from '../utils/write-guard';
import { resolveEffectiveSubCategory, recomputeQualityScoreSafely, loadScoreChildren } from '../lib/quality-score';
import { refinedQuestionIds } from '../../models/quality-score';
import type { QualityContract } from '../../models/quality-contract';
import { queryOne } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const REVIEW_ROUTE = /^\/api\/items\/([^/]+)\/quality-review$/;
const ANSWERS_ROUTE = /^\/api\/items\/([^/]+)\/quality-review\/answers$/;

// The two writers of an item's answers never overwrite each other (plan E13): the Einzelteile page
// sets slot answers (PATCH …/answers), the assessment form the item's own questions (POST). A POST
// that does not send a slot answer keeps the stored one — read here, at save time, so a presence
// chip clicked while the form was open is not lost to the form's stale copy.
function slotQuestionIds(assembly: AssemblyContract | null): Set<string> {
  return new Set(assembly ? assemblyToQualityContract(assembly).questions.map((q) => q.id) : []);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function scoringContracts(subCategory: number | undefined, assemblyContract: AssemblyContract | null): QualityContract[] {
  const subCatContract = subCategory !== undefined ? loadSubCategoryContract(subCategory) : null;
  return [
    loadGeneralContract(),
    ...(assemblyContract ? [assemblyToQualityContract(assemblyContract)] : []),
    ...(subCatContract ? [subCatContract] : []),
  ];
}

function scoreAnswers(subCategory: number | undefined, assemblyContract: AssemblyContract | null, answers: Record<string, string>) {
  const generalContract = loadGeneralContract();
  const subCatContract = subCategory !== undefined ? loadSubCategoryContract(subCategory) : null;
  const assemblyQualityContract = assemblyContract ? assemblyToQualityContract(assemblyContract) : null;
  return buildQualityCheckResponse(generalContract, subCatContract, answers, assemblyQualityContract, assemblyContract);
}

const action = defineHttpAction({
  key: 'quality-review',
  label: 'Quality Review',
  appliesTo: () => false,
  matches: (path, method) =>
    (REVIEW_ROUTE.test(path) && (method === 'POST' || method === 'GET')) ||
    (ANSWERS_ROUTE.test(path) && method === 'PATCH'),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const urlPath = (req.url || '').split('?')[0];
      if (ANSWERS_ROUTE.test(urlPath)) return await handleAnswersPatch(req, res, ctx, decodeURIComponent(urlPath.match(ANSWERS_ROUTE)![1]));
      const match = urlPath.match(REVIEW_ROUTE);
      const itemUUID = match ? decodeURIComponent(match[1]) : '';
      if (!itemUUID) return sendJson(res, 400, { error: 'invalid item id' });
      if (req.method !== 'GET' && !(await guardWrite(ctx, res, 'item', itemUUID))) return;

      const item = await ctx.getItem(itemUUID);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      if (req.method === 'GET') {
        const result = await getItemQualityResponses(itemUUID);
        return sendJson(res, 200, result);
      }

      const data = await readBody(req);
      if (!data) return sendJson(res, 400, { error: 'invalid JSON body' });

      const reviewed_by = resolveActor(ctx, typeof data.reviewed_by === 'string' ? data.reviewed_by : '');
      if (!reviewed_by) return sendJson(res, 400, { error: 'reviewed_by is required' });

      if (typeof data.answers !== 'object' || data.answers === null || Array.isArray(data.answers)) {
        return sendJson(res, 400, { error: 'answers object is required' });
      }
      const submitted = data.answers as Record<string, string>;

      // The server decides which contract scores the item; the client value is only a fallback for
      // items the server cannot place (no reference, no slot), so a stale or wrong client category
      // cannot score an item — or, via the roll-up, its parents — against the wrong contract.
      const clientSubCategory = typeof data.subCategory === 'number' ? data.subCategory : undefined;
      let resolvedSubCategory: number | null = null;
      try {
        resolvedSubCategory = await resolveEffectiveSubCategory(itemUUID);
      } catch (err) {
        console.error('[quality-review] Failed to resolve effective subcategory', { itemUUID, error: err });
      }
      if (resolvedSubCategory !== null && clientSubCategory !== undefined && clientSubCategory !== resolvedSubCategory) {
        console.warn('[quality-review] Client subCategory differs from resolved one; using resolved', { itemUUID, clientSubCategory, resolvedSubCategory });
      }
      const subCategory = resolvedSubCategory ?? clientSubCategory;
      const notes = typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null;

      const assemblyContract = subCategory !== undefined ? getAssemblyContract(subCategory) : null;
      const stored = (await getItemQualityResponses(itemUUID)).responses;
      const answers: Record<string, string> = { ...submitted };
      for (const id of slotQuestionIds(assemblyContract)) {
        if (!(id in answers) && id in stored) answers[id] = stored[id];
      }
      // Device questions whose parts are all assessed are locked (S1): keep the stored answer.
      let locked = new Set<string>();
      if (assemblyContract) {
        const children = await loadScoreChildren(itemUUID);
        locked = refinedQuestionIds({ contracts: scoringContracts(subCategory, assemblyContract), answers, assembly: assemblyContract, children });
        for (const id of locked) {
          if (id in stored) answers[id] = stored[id];
          else delete answers[id];
        }
      }

      let checkResponse;
      try {
        checkResponse = scoreAnswers(subCategory, assemblyContract, answers);
      } catch (err) {
        console.error('[quality-review] Failed to load general contract', err);
        return sendJson(res, 500, { error: 'Failed to load quality contract' });
      }

      const assessment = {
        tag: checkResponse.qualityTag as import('../../models/quality').QualityTag,
        value: checkResponse.qualityValue,
        is_complete: null as boolean | null,
        has_defects: null as boolean | null,
        is_functional: null as boolean | null,
        notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by,
        checkResponse,
      };

      let id: number;
      try {
        id = await insertQualityAssessment(assessment);
      } catch (err) {
        console.error('[quality-review] Failed to insert quality assessment', { itemUUID, error: err });
        return sendJson(res, 500, { error: 'Failed to save quality assessment' });
      }

      try {
        await updateItemQualityAssessment(itemUUID, id, checkResponse.qualityValue);
      } catch (err) {
        console.error('[quality-review] Failed to update item quality fields', { itemUUID, id, error: err });
        return sendJson(res, 500, { error: 'Failed to link quality assessment to item' });
      }

      // Quality review is a meaningful lifecycle action but previously logged no event.
      try {
        await ctx.logEvent?.({
          Actor: reviewed_by || null,
          EntityType: 'Item',
          EntityId: itemUUID,
          Event: 'QualityAssessed',
          Meta: JSON.stringify({
            source: 'quality-review',
            value: checkResponse.qualityValue,
            tag: checkResponse.qualityTag ?? null,
            subCategory: subCategory ?? null,
          }),
        });
      } catch (logErr) {
        console.error('[quality-review] Failed to log QualityAssessed event', { itemUUID, error: logErr });
      }

      // A locked question's answer is kept for history, but its spec line would contradict the parts.
      for (const key of Object.keys(lockedSpecsFromAnswers(scoringContracts(subCategory, assemblyContract), answers, locked))) {
        delete checkResponse.derivedSpecs[key];
      }
      if (Object.keys(checkResponse.derivedSpecs).length > 0) {
        try {
          await updateItemInstanceSpecs(itemUUID, checkResponse.derivedSpecs);
        } catch (err) {
          // Non-fatal: store failure doesn't fail the whole review
          console.warn('[quality-review] Failed to store derived specs into InstanceSpecs', { itemUUID, error: err });
        }
      }

      await recomputeQualityScoreSafely(itemUUID, { actor: reviewed_by, logEvent: ctx.logEvent });
      let qualityScore: { min: number; max: number } | null = null;
      try {
        const row = await queryOne<{ QualityScoreMin: number | null; QualityScoreMax: number | null }>(
          `SELECT "QualityScoreMin", "QualityScoreMax" FROM items WHERE "ItemUUID" = $1`,
          [itemUUID]
        );
        if (row && row.QualityScoreMin !== null && row.QualityScoreMax !== null) {
          qualityScore = { min: Number(row.QualityScoreMin), max: Number(row.QualityScoreMax) };
        }
      } catch (err) {
        console.warn('[quality-review] Failed to read quality score', { itemUUID, error: err });
      }

      console.info('[quality-review] Quality assessment created', {
        itemUUID,
        id,
        tag: checkResponse.qualityTag,
        value: checkResponse.qualityValue,
        subCategory,
        reviewed_by,
      });

      sendJson(res, 200, {
        id,
        tag: checkResponse.qualityTag,
        value: checkResponse.qualityValue,
        notes,
        reviewed_at: assessment.reviewed_at,
        reviewed_by,
        answers: checkResponse.answers,
        derivedSpecs: checkResponse.derivedSpecs,
        generalContractVersion: checkResponse.generalContractVersion,
        ...(checkResponse.subCategoryContractVersion !== undefined
          ? { subCategoryContractVersion: checkResponse.subCategoryContractVersion }
          : {}),
        ...(subCategory !== undefined ? { subCategory } : {}),
        qualityScore,
      });
    } catch (err) {
      console.error('[quality-review] Unexpected error', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Quality review API</p></div>'
});

/**
 * PATCH /api/items/:id/quality-review/answers — `{ answers: { part_battery: "Vorhanden" } }` merges
 * slot answers into the item's latest assessment (in place: no history row per click; a first
 * assessment is created when there is none). Only slot questions of the item's assembly are
 * accepted; an empty value clears that answer.
 */
async function handleAnswersPatch(req: IncomingMessage, res: ServerResponse, ctx: any, itemUUID: string): Promise<void> {
  if (!itemUUID) return sendJson(res, 400, { error: 'invalid item id' });
  if (!(await guardWrite(ctx, res, 'item', itemUUID))) return;
  const item = await ctx.getItem(itemUUID);
  if (!item) return sendJson(res, 404, { error: 'item not found' });

  const data = await readBody(req);
  if (!data) return sendJson(res, 400, { error: 'invalid JSON body' });
  const actor = resolveActor(ctx, typeof data.reviewed_by === 'string' ? data.reviewed_by : '');
  if (!actor) return sendJson(res, 400, { error: 'reviewed_by is required' });
  const patch = data.answers;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) {
    return sendJson(res, 400, { error: 'answers object is required' });
  }

  const resolved = await resolveEffectiveSubCategory(itemUUID);
  const subCategory = resolved ?? undefined;
  const assemblyContract = subCategory !== undefined ? getAssemblyContract(subCategory) : null;
  const allowed = slotQuestionIds(assemblyContract);
  const foreign = Object.keys(patch).filter((id) => !allowed.has(id));
  if (foreign.length > 0) return sendJson(res, 400, { error: `not slot questions of this item: ${foreign.join(', ')}` });
  const badValue = Object.entries(patch).find(([, v]) => v !== null && typeof v !== 'string');
  if (badValue) return sendJson(res, 400, { error: `answer "${badValue[0]}" must be a string` });

  const answers = { ...(await getItemQualityResponses(itemUUID)).responses };
  for (const [id, value] of Object.entries(patch as Record<string, string | null>)) {
    if (value === null || value.trim() === '') delete answers[id];
    else answers[id] = value;
  }
  const checkResponse = scoreAnswers(subCategory, assemblyContract, answers);
  const tag = checkResponse.qualityTag as import('../../models/quality').QualityTag;

  const link = await queryOne<{ QualityId: number | null }>(`SELECT "QualityId" FROM items WHERE "ItemUUID" = $1`, [itemUUID]);
  const qualityId = link?.QualityId == null ? null : Number(link.QualityId);
  let id: number;
  if (qualityId !== null && Number.isFinite(qualityId)) {
    id = qualityId;
    await updateQualityAssessmentAnswers(id, tag, checkResponse.qualityValue, checkResponse);
  } else {
    id = await insertQualityAssessment({
      tag,
      value: checkResponse.qualityValue,
      is_complete: null,
      has_defects: null,
      is_functional: null,
      notes: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor,
      checkResponse,
    });
    await updateItemQualityAssessment(itemUUID, id, checkResponse.qualityValue);
  }

  if (Object.keys(checkResponse.derivedSpecs).length > 0) {
    try {
      await updateItemInstanceSpecs(itemUUID, checkResponse.derivedSpecs);
    } catch (err) {
      console.warn('[quality-review] Failed to store derived specs into InstanceSpecs', { itemUUID, error: err });
    }
  }
  await recomputeQualityScoreSafely(itemUUID, { actor, logEvent: ctx.logEvent });
  console.info('[quality-review] Slot answers merged', { itemUUID, id, keys: Object.keys(patch), actor });
  sendJson(res, 200, { id, answers: checkResponse.answers });
}

export default action;
