import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun } from '../../models';

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

    const providedSearch =
      typeof payload.search === 'string' ? payload.search.trim() : '';

    let existingRun: AgenticRun | undefined;
    try {
      existingRun = ctx.getAgenticRun.get(itemId) as AgenticRun | undefined;
    } catch (err) {
      console.error('Failed to load existing agentic run for restart', err);
      return sendJson(res, 500, { error: 'Failed to load agentic run' });
    }

    const nextSearchQuery = providedSearch || existingRun?.SearchQuery || null;
    const hadExistingRun = Boolean(existingRun);
    const previousStatus = existingRun?.Status ?? null;

    const restartTransaction = ctx.db.transaction(
      (
        itemUUID: string,
        searchQuery: string | null,
        hasExisting: boolean,
        prevStatus: string | null
      ) => {
        const nowIso = new Date().toISOString();
        if (hasExisting) {
          const result = ctx.updateAgenticRunStatus.run({
            ItemUUID: itemUUID,
            Status: 'queued',
            SearchQuery: searchQuery,
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null
          });
          if (!result || result.changes === 0) {
            throw new Error('No agentic run updated');
          }
        } else {
          const result = ctx.upsertAgenticRun.run({
            ItemUUID: itemUUID,
            SearchQuery: searchQuery,
            Status: 'queued',
            LastModified: nowIso,
            ReviewState: 'not_required',
            ReviewedBy: null
          });
          if (!result || result.changes === 0) {
            throw new Error('Failed to create agentic run');
          }
        }

        try {
          ctx.logEvent.run({
            Actor: actor,
            EntityType: 'Item',
            EntityId: itemUUID,
            Event: 'AgenticRunRestarted',
            Meta: JSON.stringify({ previousStatus: prevStatus, searchQuery, created: !hasExisting })
          });
        } catch (logErr) {
          console.error('Failed to log agentic restart event', logErr);
        }
      }
    );

    try {
      restartTransaction(itemId, nextSearchQuery, hadExistingRun, previousStatus);
    } catch (err) {
      console.error('Failed to reset agentic run state', err);
      return sendJson(res, 500, { error: 'Failed to restart agentic run' });
    }

    try {
      const refreshed = ctx.getAgenticRun.get(itemId) || null;
      return sendJson(res, 200, { agentic: refreshed });
    } catch (err) {
      console.error('Failed to load refreshed agentic run after restart', err);
      return sendJson(res, 500, { error: 'Failed to load refreshed agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic restart API</p></div>'
};

export default action;
