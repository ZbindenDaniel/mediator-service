import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { restartAgenticRun } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseAgenticRestartRoute(path: string): { itemId: string; legacyRoute: boolean } | null {
  const legacyMatch = path.match(/^\/api\/items\/([^/]+)\/agentic\/restart$/);
  if (legacyMatch) {
    return { itemId: decodeURIComponent(legacyMatch[1]), legacyRoute: true };
  }
  const refMatch = path.match(/^\/api\/item-refs\/([^/]+)\/agentic\/restart$/);
  if (refMatch) {
    return { itemId: decodeURIComponent(refMatch[1]), legacyRoute: false };
  }
  return null;
}

const action = defineHttpAction({
  key: 'agentic-restart',
  label: 'Agentic restart',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) =>
    method === 'POST'
    && (
      /^\/api\/items\/[^/]+\/agentic\/restart$/.test(path)
      || /^\/api\/item-refs\/[^/]+\/agentic\/restart$/.test(path)
    ),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic restart called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const route = parseAgenticRestartRoute(req.url);
    const itemId = route?.itemId ? route.itemId.trim() : '';
    if (!itemId) {
      console.warn('Agentic restart missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }
    if (route?.legacyRoute) {
      console.warn('[agentic-restart] Legacy /api/items route used for restart', { itemId, path: req.url });
    }
    if (itemId.startsWith('I-')) {
      console.warn('[agentic-restart] Rejecting ItemUUID for agentic restart', { itemId, legacyRoute: route?.legacyRoute });
      return sendJson(res, 400, { error: 'ItemUUID not supported for agentic restart' });
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
    const requestContext = resolveAgenticRequestContext(payload, itemId);

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
          context: 'agentic-restart',
          request: requestContext
        },
        {
          db: ctx.db,
          getAgenticRun: ctx.getAgenticRun,
          getItemReference: ctx.getItemReference,
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
});

export default action;
