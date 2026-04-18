import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { insertQualityAssessment, updateItemQualityAssessment } from '../db';
import { deriveQualityTagFromCondition } from '../../models/quality';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

const action = defineHttpAction({
  key: 'quality-review',
  label: 'Quality Review',
  appliesTo: () => false,
  matches: (path, method) =>
    /^\/api\/items\/[^/]+\/quality-review$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/quality-review$/);
      const itemUUID = match ? decodeURIComponent(match[1]) : '';
      if (!itemUUID) return sendJson(res, 400, { error: 'invalid item id' });

      const item = ctx.getItem.get(itemUUID);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(raw || '{}'); } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }

      const reviewed_by = typeof data.reviewed_by === 'string' ? data.reviewed_by.trim() : '';
      if (!reviewed_by) return sendJson(res, 400, { error: 'reviewed_by is required' });

      const answers = {
        is_complete: parseNullableBoolean(data.is_complete),
        has_defects: parseNullableBoolean(data.has_defects),
        is_functional: parseNullableBoolean(data.is_functional)
      };

      const { tag, value } = deriveQualityTagFromCondition(answers);
      const notes = typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null;

      const assessment = {
        tag,
        value,
        is_complete: answers.is_complete,
        has_defects: answers.has_defects,
        is_functional: answers.is_functional,
        notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by
      };

      let id: number;
      try {
        id = insertQualityAssessment(assessment);
      } catch (err) {
        console.error('[quality-review] Failed to insert quality assessment', { itemUUID, error: err });
        return sendJson(res, 500, { error: 'Failed to save quality assessment' });
      }

      try {
        updateItemQualityAssessment(itemUUID, id, value);
      } catch (err) {
        console.error('[quality-review] Failed to update item quality fields', { itemUUID, id, error: err });
        return sendJson(res, 500, { error: 'Failed to link quality assessment to item' });
      }

      console.info('[quality-review] Quality assessment created', { itemUUID, id, tag, value, reviewed_by });
      sendJson(res, 200, { id, ...assessment });
    } catch (err) {
      console.error('[quality-review] Unexpected error', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Quality review API</p></div>'
});

export default action;
