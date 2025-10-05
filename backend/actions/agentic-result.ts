import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun, ItemRecord } from '../../models';
import { AGENTIC_SHARED_SECRET } from '../config';

const SHARED_SECRET_HEADER = 'x-agent-secret';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

const action: Action = {
  key: 'agentic-result',
  label: 'Agentic result webhook',
  appliesTo: () => false,
  matches: (path, method) => method === 'POST' && /^\/api\/agentic\/items\/[^/]+\/result$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      if (!req.url) return sendJson(res, 400, { error: 'Invalid request' });
      const match = req.url.match(/^\/api\/agentic\/items\/([^/]+)\/result$/);
      const itemId = match ? decodeURIComponent(match[1]) : '';
      if (!itemId) {
        console.warn('Agentic result missing item id');
        return sendJson(res, 400, { error: 'Invalid item id' });
      }

      const providedSecret = String(req.headers[SHARED_SECRET_HEADER] || '');
      if (!AGENTIC_SHARED_SECRET || !providedSecret || providedSecret !== AGENTIC_SHARED_SECRET) {
        console.warn('Agentic result rejected due to invalid secret');
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload: any;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.error('Failed to parse agentic payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON payload' });
      }

      if (!payload || typeof payload !== 'object') {
        console.warn('Agentic result missing payload object');
        return sendJson(res, 400, { error: 'Payload is required' });
      }

      const statusInput = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : 'completed';
      const agentStatus = statusInput || 'completed';
      const errorMessage = typeof payload.error === 'string' ? payload.error.trim() || null : null;
      const needsReview = Boolean(payload.needsReview);
      const summaryInputRaw = typeof payload.summary === 'string' ? payload.summary.trim() : '';
      const summaryInput = summaryInputRaw ? summaryInputRaw : null;
      const reviewDecisionRaw = typeof payload.reviewDecision === 'string' ? payload.reviewDecision.trim().toLowerCase() : '';
      const reviewDecisionInput = reviewDecisionRaw ? reviewDecisionRaw : null;
      const reviewNotesRaw = typeof payload.reviewNotes === 'string' ? payload.reviewNotes.trim() : '';
      const reviewNotesInput = reviewNotesRaw ? reviewNotesRaw : null;
      const reviewInfo = {
        ReviewedBy: payload.reviewedBy ?? null
      };
      const agenticActor = typeof payload.actor === 'string' && payload.actor ? payload.actor : 'agentic-service';
      const nowIso = new Date().toISOString();
      const eventName = errorMessage ? 'AgenticResultFailed' : 'AgenticResultReceived';
      const txn = ctx.db.transaction(
        (
          itemUUID: string,
          agenticPayload: any,
          status: string,
          now: string,
          errorText: string | null,
          needsHumanReview: boolean,
          summary: string | null,
          actor: string,
          review: { ReviewedBy: string | null; Decision: string | null; Notes: string | null }
        ) => {
          const existingItem = ctx.getItem.get(itemUUID);
          if (!existingItem) {
            throw new Error('Item not found');
          }
          const existingRun = ctx.getAgenticRun.get(itemUUID) as AgenticRun | undefined;
          const merged: Record<string, any> = { ...existingItem };
          if (agenticPayload && typeof agenticPayload === 'object') {
            Object.entries(agenticPayload).forEach(([key, value]) => {
              if (value !== undefined) merged[key] = value;
            });
          }
          merged.ItemUUID = itemUUID;
          merged.UpdatedAt = now;

          const mergedRecord: ItemRecord = {
            ...(merged as ItemRecord),
            UpdatedAt: toDate(now) ?? new Date(),
            Datum_erfasst: toDate(merged.Datum_erfasst)
          };
          ctx.upsertItemRecord(mergedRecord);

          const normalizedDecision = review.Decision ? review.Decision.toLowerCase() : null;
          const fallbackReviewState = existingRun?.ReviewState && existingRun.ReviewState !== 'pending'
            ? existingRun.ReviewState
            : 'not_required';
          const effectiveReviewState = needsHumanReview
            ? 'pending'
            : normalizedDecision || fallbackReviewState;
          const effectiveReviewedBy = effectiveReviewState === 'pending'
            ? null
            : review.ReviewedBy ?? existingRun?.ReviewedBy ?? null;
          const searchQueryUpdate = typeof agenticPayload?.searchQuery === 'string' && agenticPayload.searchQuery.trim()
            ? agenticPayload.searchQuery.trim()
            : existingRun?.SearchQuery ?? null;
          const runUpdate = {
            ItemUUID: itemUUID,
            SearchQuery: searchQueryUpdate,
            Status: status,
            LastModified: now,
            ReviewState: effectiveReviewState,
            ReviewedBy: effectiveReviewedBy
          };

          const updateResult = ctx.updateAgenticRunStatus.run(runUpdate);
          if (!updateResult?.changes) {
            console.warn('Agentic run missing on status update, creating record', itemUUID);
            ctx.upsertAgenticRun.run(runUpdate);
          }

          ctx.logEvent.run({
            Actor: actor,
            EntityType: 'Item',
            EntityId: itemUUID,
            Event: eventName,
            Meta: JSON.stringify({
              Status: status,
              ReviewState: effectiveReviewState,
              NeedsReview: needsHumanReview,
              Summary: summary,
              Error: errorText,
              ReviewNotes: review.Notes,
              LastModified: now
            })
          });
        }
      );

      try {
        txn(
          itemId,
          payload.item,
          agentStatus,
          nowIso,
          errorMessage,
          needsReview,
          summaryInput,
          agenticActor,
          {
            ReviewedBy: reviewInfo.ReviewedBy,
            Decision: reviewDecisionInput,
            Notes: reviewNotesInput
          }
        );
      } catch (err) {
        if ((err as Error).message === 'Item not found') {
          console.error('Agentic result item not found', itemId);
          return sendJson(res, 404, { error: 'Item not found' });
        }
        console.error('Agentic result transaction failed', err);
        return sendJson(res, 500, { error: 'Failed to process agentic result' });
      }

      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Agentic result handler failed', err);
      return sendJson(res, 500, { error: 'Internal error' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic result endpoint</p></div>'
};

export default action;
