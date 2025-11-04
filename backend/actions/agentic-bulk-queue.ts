import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import type { Action } from './index';
import type { AgenticRun } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

type AgenticQueueMode = 'all' | 'missing';

type AgenticBulkQueueResult = {
  queued: number;
  skipped: number;
};

const action: Action = {
  key: 'agentic-bulk-queue',
  label: 'Agentic bulk queue',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/queue' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('[agentic-bulk-queue] Request missing URL reference');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const requestUrl = new URL(req.url, PUBLIC_ORIGIN);
    const rawMode = (requestUrl.searchParams.get('mode') || '').trim().toLowerCase();
    const mode: AgenticQueueMode | null = rawMode === 'all' || rawMode === 'missing' ? (rawMode as AgenticQueueMode) : null;

    if (!mode) {
      console.warn('[agentic-bulk-queue] Invalid mode provided', { mode: rawMode });
      return sendJson(res, 400, { error: 'mode must be "all" or "missing"' });
    }

    const actor = (requestUrl.searchParams.get('actor') || '').trim();
    if (!actor) {
      console.warn('[agentic-bulk-queue] Missing actor for bulk queue request', { mode });
      return sendJson(res, 400, { error: 'actor is required' });
    }

    let items: Array<{ ItemUUID?: string }> = [];
    try {
      items = ctx.listItems.all();
    } catch (err) {
      console.error('[agentic-bulk-queue] Failed to load items for queue operation', err);
      return sendJson(res, 500, { error: 'Failed to load items' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.info('[agentic-bulk-queue] No items available for bulk queue', { mode });
      return sendJson(res, 200, { ok: true, mode, total: 0, queued: 0, skipped: 0 });
    }

    const queueTransaction = ctx.db.transaction(
      (records: Array<{ ItemUUID?: string }>, options: { mode: AgenticQueueMode; actor: string }): AgenticBulkQueueResult => {
        let queued = 0;
        let skipped = 0;

        for (const record of records) {
          const rawItemUUID = typeof record?.ItemUUID === 'string' ? record.ItemUUID.trim() : '';
          if (!rawItemUUID) {
            skipped += 1;
            console.warn('[agentic-bulk-queue] Skipping item without valid ItemUUID', { record });
            continue;
          }

          let existingRun: AgenticRun | undefined;
          try {
            existingRun = ctx.getAgenticRun.get(rawItemUUID) as AgenticRun | undefined;
          } catch (loadErr) {
            console.error('[agentic-bulk-queue] Failed to load existing agentic run', { itemUUID: rawItemUUID }, loadErr);
            throw loadErr;
          }

          if (options.mode === 'missing' && existingRun) {
            skipped += 1;
            continue;
          }

          const nowIso = new Date().toISOString();
          const upsertPayload = {
            ItemUUID: rawItemUUID,
            SearchQuery: existingRun?.SearchQuery ?? null,
            Status: 'queued',
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null,
            LastReviewDecision: existingRun?.LastReviewDecision ?? null,
            LastReviewNotes: existingRun?.LastReviewNotes ?? null
          };

          try {
            const result = ctx.upsertAgenticRun.run(upsertPayload);
            if (result && typeof result.changes === 'number' && result.changes < 1) {
              throw new Error('Agentic run upsert returned zero changes');
            }
          } catch (upsertErr) {
            console.error('[agentic-bulk-queue] Failed to queue agentic run', { itemUUID: rawItemUUID }, upsertErr);
            throw upsertErr;
          }

          try {
            ctx.logEvent({
              Actor: options.actor,
              EntityType: 'Item',
              EntityId: rawItemUUID,
              Event: 'AgenticSearchQueued',
              Meta: JSON.stringify({
                mode: options.mode,
                previousStatus: existingRun?.Status ?? null,
                hadExistingRun: Boolean(existingRun)
              })
            });
          } catch (logErr) {
            console.error('[agentic-bulk-queue] Failed to persist log event', { itemUUID: rawItemUUID }, logErr);
          }

          queued += 1;
        }

        return { queued, skipped };
      }
    );

    let result: AgenticBulkQueueResult;
    try {
      result = queueTransaction(items, { mode, actor });
    } catch (err) {
      console.error('[agentic-bulk-queue] Transaction failed while queuing agentic runs', err);
      return sendJson(res, 500, { error: 'Failed to queue agentic runs' });
    }

    const total = items.length;
    console.info('[agentic-bulk-queue] Agentic bulk queue completed', { mode, total, queued: result.queued, skipped: result.skipped });

    return sendJson(res, 200, { ok: true, mode, total, queued: result.queued, skipped: result.skipped });
  },
  view: () => '<div class="card"><p class="muted">Agentic bulk queue API</p></div>'
};

export default action;
