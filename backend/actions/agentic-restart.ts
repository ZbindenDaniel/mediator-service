import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun } from '../../models';
import { AGENTIC_RUN_STATUS_QUEUED } from '../../models';
import { forwardAgenticTrigger } from './agentic-trigger';

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

    let existingRun: AgenticRun | undefined;
    try {
      existingRun = ctx.getAgenticRun.get(itemId) as AgenticRun | undefined;
    } catch (err) {
      console.error('Failed to load existing agentic run for restart', err);
      return sendJson(res, 500, { error: 'Failed to load agentic run' });
    }

    const nextSearchQuery = providedSearch || existingRun?.SearchQuery || null;
    const reviewMetadata = {
      decision: normalizedReviewDecision || existingRun?.LastReviewDecision || null,
      notes: normalizedReviewNotes || existingRun?.LastReviewNotes || null,
      reviewedBy: normalizedReviewActor || existingRun?.ReviewedBy || null
    };
    const hadExistingRun = Boolean(existingRun);
    const previousStatus = existingRun?.Status ?? null;

    const restartTransaction = ctx.db.transaction(
      (
        itemUUID: string,
        searchQuery: string | null,
        hasExisting: boolean,
        prevStatus: string | null,
        review: { decision: string | null; notes: string | null; reviewedBy: string | null }
      ) => {
        const nowIso = new Date().toISOString();
        if (hasExisting) {
          const result = ctx.updateAgenticRunStatus.run({
            ItemUUID: itemUUID,
            Status: AGENTIC_RUN_STATUS_QUEUED,
            SearchQuery: searchQuery,
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null,
            LastReviewDecision: review.decision,
            LastReviewNotes: review.notes
          });
          if (!result || result.changes === 0) {
            throw new Error('No agentic run updated');
          }
        } else {
          const result = ctx.upsertAgenticRun.run({
            ItemUUID: itemUUID,
            SearchQuery: searchQuery,
            Status: AGENTIC_RUN_STATUS_QUEUED,
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null,
            LastReviewDecision: review.decision,
            LastReviewNotes: review.notes
          });
          if (!result || result.changes === 0) {
            throw new Error('Failed to create agentic run');
          }
        }

        ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: itemUUID,
          Event: 'AgenticRunRestarted',
          Meta: JSON.stringify({
            previousStatus: prevStatus,
            searchQuery,
            created: !hasExisting,
            lastReviewDecision: review.decision,
            lastReviewNotes: review.notes,
            lastReviewActor: review.reviewedBy
          })
        });
      }
    );

    try {
      restartTransaction(itemId, nextSearchQuery, hadExistingRun, previousStatus, reviewMetadata);
    } catch (err) {
      console.error('Failed to reset agentic run state', err);
      return sendJson(res, 500, { error: 'Failed to restart agentic run' });
    }

    let refreshed: AgenticRun | null = null;
    try {
      refreshed = (ctx.getAgenticRun.get(itemId) as AgenticRun | undefined) || null;
    } catch (err) {
      console.error('Failed to load refreshed agentic run after restart', err);
      return sendJson(res, 500, { error: 'Failed to load refreshed agentic run' });
    }

    if (ctx.agenticServiceEnabled) {
      const triggerSearchTerm =
        (typeof nextSearchQuery === 'string' && nextSearchQuery.trim()) ||
        (typeof refreshed?.SearchQuery === 'string' && refreshed.SearchQuery.trim()) ||
        null;

      if (!triggerSearchTerm) {
        console.warn('[agentic-restart] Agentic trigger skipped: missing search term after restart', {
          itemId
        });
      } else {
        try {
          const triggerPayload: AgenticRunTriggerPayload = {
            itemId,
            artikelbeschreibung: triggerSearchTerm
          };
          const reviewForDispatch = {
            decision: refreshed?.LastReviewDecision ?? reviewMetadata.decision ?? null,
            notes: refreshed?.LastReviewNotes ?? reviewMetadata.notes ?? null,
            reviewedBy: refreshed?.ReviewedBy ?? reviewMetadata.reviewedBy ?? null
          };
          const hasReviewDetails = Boolean(
            (reviewForDispatch.decision && reviewForDispatch.decision.trim()) ||
              (reviewForDispatch.notes && reviewForDispatch.notes.trim()) ||
              (reviewForDispatch.reviewedBy && reviewForDispatch.reviewedBy.trim())
          );
          if (hasReviewDetails) {
            triggerPayload.review = reviewForDispatch;
          }

          const result = await forwardAgenticTrigger(
            triggerPayload,
            {
              context: 'agentic-restart',
              logger: console
            }
          );

          if (!result.ok) {
            console.error('[agentic-restart] Agentic trigger responded with failure', {
              itemId,
              status: result.status,
              details: result.body ?? result.rawBody
            });
          }
        } catch (triggerErr) {
          console.error('[agentic-restart] Failed to dispatch agentic trigger after restart', triggerErr);
        }
      }
    } else {
      console.info('[agentic-restart] Agentic service disabled; skipping trigger dispatch', { itemId });
    }

    return sendJson(res, 200, { agentic: refreshed });
  },
  view: () => '<div class="card"><p class="muted">Agentic restart API</p></div>'
};

export default action;
