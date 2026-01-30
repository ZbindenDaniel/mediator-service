import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { deleteAgenticRun } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'agentic-delete',
  label: 'Agentic delete',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) => method === 'POST' && /^\/api\/items\/[^/]+\/agentic\/delete$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic delete called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const match = req.url.match(/^\/api\/items\/([^/]+)\/agentic\/delete$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';
    if (!itemId) {
      console.warn('Agentic delete missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch (err) {
      console.error('Failed to read agentic delete payload', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let payload: any = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse agentic delete payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
    const reason = typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : null;
    if (!actor) {
      console.warn('Agentic delete missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }

    const requestContext = resolveAgenticRequestContext(payload, itemId);

    try {
      const result = await deleteAgenticRun(
        { itemId, actor, reason, request: requestContext },
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

      if (!result.deleted) {
        if (result.reason === 'not-found') {
          return sendJson(res, 404, { error: 'Agentic run not found' });
        }

        if (result.reason === 'not-started') {
          return sendJson(res, 400, { error: 'Agentic run already not started' });
        }

        return sendJson(res, 400, { error: 'Unable to delete agentic run', reason: result.reason ?? null });
      }

      return sendJson(res, 200, { agentic: result.agentic });
    } catch (err) {
      console.error('Failed to delete agentic run', err);
      return sendJson(res, 500, { error: 'Failed to delete agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic delete API</p></div>'
});

export default action;
