import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { AGENTIC_RUN_STATUS_APPROVED, AGENTIC_RUN_STATUS_REJECTED } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-status',
  label: 'Agentic status',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => {
    if (method === 'GET') return /^\/api\/items\/[^/]+\/agentic$/.test(path);
    if (method === 'POST') return /^\/api\/items\/[^/]+\/agentic\/review$/.test(path);
    return false;
  },
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const url = req.url || '';
    const match = url.match(/^\/api\/items\/([^/]+)\/agentic(?:\/review)?$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) {
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    if (req.method === 'GET') {
      try {
        const run = ctx.getAgenticRun.get(itemId) || null;
        return sendJson(res, 200, { agentic: run });
      } catch (err) {
        console.error('Fetch agentic status failed', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    try {
      const run = ctx.getAgenticRun.get(itemId);
      if (!run) {
        return sendJson(res, 404, { error: 'Agentic run not found' });
      }

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.error('Failed to parse agentic review payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const decision = typeof data.decision === 'string' ? data.decision.trim().toLowerCase() : '';
      const notes = typeof data.notes === 'string' ? data.notes.trim() : '';

      if (!actor) {
        return sendJson(res, 400, { error: 'actor is required' });
      }
      if (!['approved', 'rejected'].includes(decision)) {
        return sendJson(res, 400, { error: 'decision must be approved or rejected' });
      }

      const reviewedAt = new Date().toISOString();
      const status = decision === 'approved' ? AGENTIC_RUN_STATUS_APPROVED : AGENTIC_RUN_STATUS_REJECTED;

      try {
        const result = ctx.updateAgenticReview.run({
          ItemUUID: itemId,
          ReviewState: decision,
          ReviewedBy: actor,
          LastModified: reviewedAt,
          Status: status,
          LastReviewDecision: decision,
          LastReviewNotes: notes || null
        });
        if (!result || result.changes === 0) {
          console.error('Agentic review update had no effect for', itemId);
          return sendJson(res, 500, { error: 'Failed to update review state' });
        }
      } catch (err) {
        console.error('Failed to update agentic review', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }

      ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: itemId,
        Event: decision === 'approved' ? 'AgenticReviewApproved' : 'AgenticReviewRejected',
        Meta: JSON.stringify({ decision, notes })
      });

      try {
        const updated = ctx.getAgenticRun.get(itemId) || null;
        return sendJson(res, 200, { agentic: updated });
      } catch (err) {
        console.error('Failed to load updated agentic status', err);
        return sendJson(res, 500, { error: (err as Error).message });
      }
    } catch (err) {
      console.error('Agentic review handling failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic review API</p></div>'
};

export default action;
