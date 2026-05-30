import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { insertQualityAssessment, updateItemQualityAssessment, updateItemInstanceSpecs, getItemQualityResponses } from '../db';
import {
  loadGeneralContract,
  loadSubCategoryContract,
  buildQualityCheckResponse,
} from '../lib/quality-contracts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'quality-review',
  label: 'Quality Review',
  appliesTo: () => false,
  matches: (path, method) =>
    /^\/api\/items\/[^/]+\/quality-review$/.test(path) && (method === 'POST' || method === 'GET'),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/quality-review$/);
      const itemUUID = match ? decodeURIComponent(match[1]) : '';
      if (!itemUUID) return sendJson(res, 400, { error: 'invalid item id' });

      const item = ctx.getItem.get(itemUUID);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      if (req.method === 'GET') {
        const result = getItemQualityResponses(itemUUID);
        return sendJson(res, 200, result);
      }

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(raw || '{}'); } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }

      const reviewed_by = typeof data.reviewed_by === 'string' ? data.reviewed_by.trim() : '';
      if (!reviewed_by) return sendJson(res, 400, { error: 'reviewed_by is required' });

      if (typeof data.answers !== 'object' || data.answers === null || Array.isArray(data.answers)) {
        return sendJson(res, 400, { error: 'answers object is required' });
      }
      const answers = data.answers as Record<string, string>;

      const subCategory = typeof data.subCategory === 'number' ? data.subCategory : undefined;
      const notes = typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null;

      let generalContract;
      try {
        generalContract = loadGeneralContract();
      } catch (err) {
        console.error('[quality-review] Failed to load general contract', err);
        return sendJson(res, 500, { error: 'Failed to load quality contract' });
      }

      const subCatContract = subCategory !== undefined ? loadSubCategoryContract(subCategory) : null;
      const checkResponse = buildQualityCheckResponse(generalContract, subCatContract, answers);

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

      if (Object.keys(checkResponse.derivedSpecs).length > 0) {
        try {
          await updateItemInstanceSpecs(itemUUID, checkResponse.derivedSpecs);
        } catch (err) {
          // Non-fatal: store failure doesn't fail the whole review
          console.warn('[quality-review] Failed to store derived specs into InstanceSpecs', { itemUUID, error: err });
        }
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
      });
    } catch (err) {
      console.error('[quality-review] Unexpected error', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Quality review API</p></div>'
});

export default action;
