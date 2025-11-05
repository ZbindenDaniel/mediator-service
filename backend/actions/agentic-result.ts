import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun, AgenticRequestContext, Item } from '../../models';
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  AGENTIC_RUN_RESTARTABLE_STATUSES,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  normalizeAgenticRunStatus
} from '../../models';
import { AGENTIC_SHARED_SECRET } from '../config';
import { recordAgenticRequestLogUpdate } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

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
    const requestLogger = console;
    let requestContext: AgenticRequestContext | null = null;
    let searchQueryForLog: string | null = null;
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

      requestContext = resolveAgenticRequestContext(payload, itemId);
      const initialSearch =
        payload && typeof payload === 'object' && typeof payload.search === 'string' && payload.search.trim()
          ? payload.search.trim()
          : null;

      if (!payload || typeof payload !== 'object') {
        console.warn('Agentic result missing payload object');
        recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
          error: 'payload-required',
          markRunning: true,
          searchQuery: initialSearch,
          logger: requestLogger
        });
        return sendJson(res, 400, { error: 'Payload is required' });
      }

      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_RUNNING, {
        markRunning: true,
        searchQuery: initialSearch,
        logger: requestLogger
      });

      const statusInput = typeof payload.status === 'string' ? payload.status : '';
      const normalizedIncomingStatus = normalizeAgenticRunStatus(statusInput);
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
      let statusForPersistence = normalizedIncomingStatus;

      const normalizedDecision = reviewDecisionInput ? reviewDecisionInput.toLowerCase() : null;
      if (AGENTIC_RUN_ACTIVE_STATUSES.has(statusForPersistence)) {
        // queued and running statuses remain untouched
      } else if (errorMessage || statusForPersistence === AGENTIC_RUN_STATUS_FAILED) {
        statusForPersistence = AGENTIC_RUN_STATUS_FAILED;
      } else if (statusForPersistence === AGENTIC_RUN_STATUS_CANCELLED) {
        statusForPersistence = AGENTIC_RUN_STATUS_CANCELLED;
      } else if (normalizedDecision === 'approved') {
        statusForPersistence = AGENTIC_RUN_STATUS_APPROVED;
      } else if (normalizedDecision === 'rejected') {
        statusForPersistence = AGENTIC_RUN_STATUS_REJECTED;
      } else if (needsReview) {
        statusForPersistence = AGENTIC_RUN_STATUS_REVIEW;
      } else if (statusForPersistence === AGENTIC_RUN_STATUS_REVIEW) {
        statusForPersistence = AGENTIC_RUN_STATUS_REVIEW;
      } else if (AGENTIC_RUN_RESTARTABLE_STATUSES.has(statusForPersistence)) {
        // allow explicit webhook overrides into approved/rejected/failed/cancelled
      } else {
        statusForPersistence = AGENTIC_RUN_STATUS_APPROVED;
      }

      const eventName =
        statusForPersistence === AGENTIC_RUN_STATUS_FAILED ? 'AgenticResultFailed' : 'AgenticResultReceived';
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

          const mergedDatum = toIsoString(merged.Datum_erfasst);
          const itemPayload: Item = {
            ...(merged as Item),
            UpdatedAt: new Date(now),
            Datum_erfasst: mergedDatum ? new Date(mergedDatum) : undefined,
            Veröffentlicht_Status: normalizePublishedStatus(merged.Veröffentlicht_Status) === 'yes'
          };
          ctx.persistItemWithinTransaction(itemPayload);

          const effectiveReviewState =
            status === AGENTIC_RUN_STATUS_REVIEW
              ? 'pending'
              : status === AGENTIC_RUN_STATUS_APPROVED
                ? 'approved'
                : status === AGENTIC_RUN_STATUS_REJECTED
                  ? 'rejected'
                  : 'not_required';
          const effectiveReviewedBy =
            effectiveReviewState === 'pending'
              ? null
              : review.ReviewedBy ?? existingRun?.ReviewedBy ?? null;
          const normalizedReviewDecision =
            typeof review.Decision === 'string' && review.Decision.trim()
              ? review.Decision.trim().toLowerCase()
              : existingRun?.LastReviewDecision ?? null;
          const normalizedReviewNotes =
            typeof review.Notes === 'string' && review.Notes.trim()
              ? review.Notes.trim()
              : existingRun?.LastReviewNotes ?? null;
          const searchQueryUpdate = typeof agenticPayload?.searchQuery === 'string' && agenticPayload.searchQuery.trim()
            ? agenticPayload.searchQuery.trim()
            : existingRun?.SearchQuery ?? null;
          searchQueryForLog = searchQueryUpdate;
          const runUpdate = {
            ItemUUID: itemUUID,
            SearchQuery: searchQueryUpdate,
            Status: status,
            LastModified: now,
            ReviewState: effectiveReviewState,
            ReviewedBy: effectiveReviewedBy,
            LastReviewDecision: normalizedReviewDecision,
            LastReviewNotes: normalizedReviewNotes
          };

          const updateResult = ctx.updateAgenticRunStatus.run(runUpdate);
          if (!updateResult?.changes) {
            console.warn('Agentic run missing on status update, creating record', itemUUID);
            ctx.upsertAgenticRun.run(runUpdate);
          }

          ctx.logEvent({
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
              ReviewNotes: normalizedReviewNotes,
              ReviewDecision: normalizedReviewDecision,
              LastModified: now
            })
          });
        }
      );

      try {
        txn(
          itemId,
          payload.item,
          statusForPersistence,
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
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Item not found') {
          console.error('Agentic result item not found', itemId);
          recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
            error: 'item-not-found',
            logger: requestLogger
          });
          return sendJson(res, 404, { error: 'Item not found' });
        }
        console.error('Agentic result transaction failed', err);
        recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
          error: message,
          searchQuery: searchQueryForLog,
          logger: requestLogger
        });
        return sendJson(res, 500, { error: 'Failed to process agentic result' });
      }

      recordAgenticRequestLogUpdate(requestContext, statusForPersistence, {
        error: errorMessage,
        searchQuery: searchQueryForLog,
        logger: requestLogger
      });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Agentic result handler failed', err);
      const failureMessage = err instanceof Error ? err.message : String(err);
      recordAgenticRequestLogUpdate(requestContext, AGENTIC_RUN_STATUS_FAILED, {
        error: failureMessage,
        searchQuery: searchQueryForLog,
        logger: requestLogger
      });
      return sendJson(res, 500, { error: 'Internal error' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic result endpoint</p></div>'
};

export default action;
