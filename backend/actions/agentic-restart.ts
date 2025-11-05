import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { restartAgenticRun } from '../agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-restart',
  label: 'Agentic restart',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => method === 'POST' && /^\/api\/items\/[^/]+\/agentic\/restart$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic restart called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const match = req.url.match(/^\/api\/items\/([^/]+)\/agentic\/restart$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) {
      console.warn('Agentic restart missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch (err) {
      console.error('Failed to read agentic restart payload', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let payload: any = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse agentic restart payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
    if (!actor) {
      console.warn('Agentic restart missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }

    const providedSearch = typeof payload.search === 'string' ? payload.search.trim() : '';
    const reviewPayload = payload && typeof payload.review === 'object' && payload.review
      ? payload.review
      : null;
    const reviewDecisionRaw =
      typeof reviewPayload?.decision === 'string' && reviewPayload.decision.trim()
        ? reviewPayload.decision
        : typeof payload.reviewDecision === 'string' && payload.reviewDecision.trim()
          ? payload.reviewDecision
          : '';
    const reviewNotesRaw =
      typeof reviewPayload?.notes === 'string' && reviewPayload.notes.trim()
        ? reviewPayload.notes
        : typeof payload.reviewNotes === 'string' && payload.reviewNotes.trim()
          ? payload.reviewNotes
          : '';
    const reviewActorRaw =
      typeof reviewPayload?.reviewedBy === 'string' && reviewPayload.reviewedBy.trim()
        ? reviewPayload.reviewedBy
        : typeof payload.reviewedBy === 'string' && payload.reviewedBy.trim()
          ? payload.reviewedBy
          : '';
    const normalizedReviewDecision = reviewDecisionRaw ? reviewDecisionRaw.trim().toLowerCase() : '';
    const normalizedReviewNotes = reviewNotesRaw ? reviewNotesRaw.trim() : '';
    const normalizedReviewActor = reviewActorRaw ? reviewActorRaw.trim() : '';

    try {
      const result = await restartAgenticRun(
        {
          itemId,
          searchQuery: providedSearch,
          actor,
          review: {
            decision: normalizedReviewDecision || null,
            notes: normalizedReviewNotes || null,
            reviewedBy: normalizedReviewActor || null
          },
          context: 'agentic-restart'
        },
        {
          db: ctx.db,
          getAgenticRun: ctx.getAgenticRun,
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          logger: console,
          now: () => new Date()
        }
      );

      if (!result.queued) {
        return sendJson(res, 400, {
          error: 'Failed to restart agentic run',
          reason: result.reason
        });
      }

      return sendJson(res, 200, { agentic: result.agentic });
    } catch (err) {
      console.error('Failed to restart agentic run', err);
      return sendJson(res, 500, { error: 'Failed to restart agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic restart API</p></div>'
};

export default action;
