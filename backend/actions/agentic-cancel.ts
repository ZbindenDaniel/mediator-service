import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { cancelAgenticRun } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
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

    const requestContext = resolveAgenticRequestContext(payload, itemId);

    try {
      const result = await cancelAgenticRun(
        { itemId, actor, request: requestContext },
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

      if (!result.cancelled) {
        if (result.reason === 'not-found') {
          return sendJson(res, 404, { error: 'Agentic run not found' });
        }

        return sendJson(res, 400, { error: 'Unable to cancel agentic run', reason: result.reason });
      }

      console.info('Agentic run cancelled', itemId, 'by', actor);
      return sendJson(res, 200, { agentic: result.agentic });
    } catch (err) {
      console.error('Failed to cancel agentic run', err);
      return sendJson(res, 500, { error: 'Failed to cancel agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic cancel API</p></div>'
});

export default action;
