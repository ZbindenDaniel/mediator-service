import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun } from '../../models';
import { AGENTIC_SHARED_SECRET } from '../config';

const SHARED_SECRET_HEADER = 'x-agent-secret';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }
  return null;
}

function normalizePublishedStatus(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') {
    return ['yes', 'ja', 'true', '1'].includes(value.trim().toLowerCase()) ? 'yes' : 'no';
  }
  return 'no';
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
      const triggeredAtInput = toIsoString(payload.triggeredAt);
      const startedAtInput = toIsoString(payload.startedAt);
      const completedAtInput = toIsoString(payload.completedAt);
      const failedAtInput = toIsoString(payload.failedAt);
      const errorMessage = typeof payload.error === 'string' ? payload.error.trim() || null : null;
      const needsReview = Boolean(payload.needsReview);
      const summaryInputRaw = typeof payload.summary === 'string' ? payload.summary.trim() : '';
      const summaryInput = summaryInputRaw ? summaryInputRaw : null;
      const reviewDecisionRaw = typeof payload.reviewDecision === 'string' ? payload.reviewDecision.trim() : '';
      const reviewDecisionInput = reviewDecisionRaw ? reviewDecisionRaw : null;
      const reviewNotesRaw = typeof payload.reviewNotes === 'string' ? payload.reviewNotes.trim() : '';
      const reviewNotesInput = reviewNotesRaw ? reviewNotesRaw : null;
      const reviewInfo = {
        ReviewedBy: payload.reviewedBy ?? null,
        ReviewedAt: toIsoString(payload.reviewedAt)
      };
      const agenticActor = typeof payload.actor === 'string' && payload.actor ? payload.actor : 'agentic-service';
      const nowIso = new Date().toISOString();
      const eventName = errorMessage ? 'AgenticResultFailed' : 'AgenticResultReceived';
      const FINAL_STATUSES = new Set(['completed', 'succeeded', 'failed', 'errored']);
      const FAILURE_STATUSES = new Set(['failed', 'errored', 'error']);
      const completionTime = completedAtInput ?? (FINAL_STATUSES.has(agentStatus) ? nowIso : null);
      let failureTime = failedAtInput;
      if (!failureTime && (FAILURE_STATUSES.has(agentStatus) || Boolean(errorMessage))) {
        failureTime = completionTime ?? nowIso;
      }

      const txn = ctx.db.transaction(
        (
          itemUUID: string,
          agenticPayload: any,
          status: string,
          now: string,
          triggered: string | null,
          started: string | null,
          completed: string | null,
          failed: string | null,
          errorText: string | null,
          needsHumanReview: boolean,
          summary: string | null,
          actor: string,
          review: { ReviewedBy: string | null; ReviewedAt: string | null; Decision: string | null; Notes: string | null }
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

          ctx.upsertItem.run({
            ...merged,
            UpdatedAt: now,
            Datum_erfasst: toIsoString(merged.Datum_erfasst),
            Veröffentlicht_Status: normalizePublishedStatus(merged.Veröffentlicht_Status)
          });

          const resolvedTriggeredAt = triggered ?? existingRun?.TriggeredAt ?? now;
          let resolvedStartedAt = started ?? existingRun?.StartedAt ?? null;
          if (!resolvedStartedAt && ['running', 'processing'].includes(status)) {
            resolvedStartedAt = now;
          }
          const resolvedCompletedAt = completed ?? existingRun?.CompletedAt ?? null;
          let resolvedFailedAt = failed ?? null;
          if (!resolvedFailedAt && FAILURE_STATUSES.has(status)) {
            resolvedFailedAt = resolvedCompletedAt ?? now;
          }
          const resolvedSummary = summary ?? errorText ?? existingRun?.Summary ?? null;
          let resolvedReviewedBy = needsHumanReview ? null : review.ReviewedBy ?? existingRun?.ReviewedBy ?? null;
          let resolvedReviewedAt = needsHumanReview ? null : review.ReviewedAt ?? existingRun?.ReviewedAt ?? null;
          let resolvedReviewDecision = needsHumanReview ? null : review.Decision ?? existingRun?.ReviewDecision ?? null;
          let resolvedReviewNotes = needsHumanReview ? null : review.Notes ?? existingRun?.ReviewNotes ?? null;

          if (needsHumanReview) {
            resolvedReviewedBy = null;
            resolvedReviewedAt = null;
            resolvedReviewDecision = null;
            resolvedReviewNotes = null;
          }

          const runUpdate = {
            ItemUUID: itemUUID,
            SearchQuery: existingRun?.SearchQuery ?? null,
            Status: status,
            TriggeredAt: resolvedTriggeredAt,
            StartedAt: resolvedStartedAt,
            CompletedAt: resolvedCompletedAt,
            FailedAt: resolvedFailedAt,
            Summary: resolvedSummary,
            NeedsReview: needsHumanReview ? 1 : 0,
            ReviewedBy: resolvedReviewedBy,
            ReviewedAt: resolvedReviewedAt,
            ReviewDecision: resolvedReviewDecision,
            ReviewNotes: resolvedReviewNotes
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
              NeedsReview: needsHumanReview,
              FailedAt: resolvedFailedAt,
              Summary: resolvedSummary,
              Error: errorText
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
          triggeredAtInput,
          startedAtInput,
          completionTime,
          failureTime,
          errorMessage,
          needsReview,
          summaryInput,
          agenticActor,
          {
            ReviewedBy: reviewInfo.ReviewedBy,
            ReviewedAt: reviewInfo.ReviewedAt,
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
