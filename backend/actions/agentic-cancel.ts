import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import type { AgenticRun } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-cancel',
  label: 'Agentic cancel',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => method === 'POST' && /^\/api\/items\/[^/]+\/agentic\/cancel$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic cancel called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const match = req.url.match(/^\/api\/items\/([^/]+)\/agentic\/cancel$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) {
      console.warn('Agentic cancel missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch (err) {
      console.error('Failed to read agentic cancel payload', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let payload: any = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse agentic cancel payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
    if (!actor) {
      console.warn('Agentic cancel missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }

    let existingRun: AgenticRun | null = null;
    try {
      existingRun = ctx.getAgenticRun.get(itemId) || null;
    } catch (err) {
      console.error('Failed to load agentic run for cancel', err);
      return sendJson(res, 500, { error: 'Failed to load agentic run' });
    }

    if (!existingRun) {
      console.warn('Agentic cancel attempted without existing run', itemId);
      return sendJson(res, 404, { error: 'Agentic run not found' });
    }

    const cancelTransaction = ctx.db.transaction(
      (
        itemUUID: string,
        searchQuery: string | null,
        actorName: string,
        previousStatus: string | null
      ) => {
        const nowIso = new Date().toISOString();
        const result = ctx.updateAgenticRunStatus.run({
          ItemUUID: itemUUID,
          Status: 'cancelled',
          SearchQuery: searchQuery,
          LastModified: nowIso,
          ReviewState: 'not_required',
          ReviewedBy: null
        });
        if (!result || result.changes === 0) {
          throw new Error('Failed to update agentic run during cancel');
        }

        try {
          ctx.logEvent.run({
            Actor: actorName,
            EntityType: 'Item',
            EntityId: itemUUID,
            Event: 'AgenticRunCancelled',
            Meta: JSON.stringify({ previousStatus, cancelledAt: nowIso })
          });
        } catch (logErr) {
          console.error('Failed to log agentic cancel event', logErr);
        }
      }
    );

    try {
      cancelTransaction(itemId, existingRun.SearchQuery || null, actor, existingRun.Status || null);
    } catch (err) {
      console.error('Failed to cancel agentic run', err);
      return sendJson(res, 500, { error: 'Failed to cancel agentic run' });
    }

    try {
      const refreshed = ctx.getAgenticRun.get(itemId) || null;
      console.info('Agentic run cancelled', itemId, 'by', actor);
      return sendJson(res, 200, { agentic: refreshed });
    } catch (err) {
      console.error('Failed to load agentic run after cancel', err);
      return sendJson(res, 500, { error: 'Failed to load agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic cancel API</p></div>'
};

export default action;
