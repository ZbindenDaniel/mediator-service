import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { cancelAgenticRun } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseAgenticCancelRoute(path: string): { itemId: string; legacyRoute: boolean } | null {
  const legacyMatch = path.match(/^\/api\/items\/([^/]+)\/agentic\/cancel$/);
  if (legacyMatch) {
    return { itemId: decodeURIComponent(legacyMatch[1]), legacyRoute: true };
  }
  const refMatch = path.match(/^\/api\/item-refs\/([^/]+)\/agentic\/cancel$/);
  if (refMatch) {
    return { itemId: decodeURIComponent(refMatch[1]), legacyRoute: false };
  }
  return null;
}

const action = defineHttpAction({
  key: 'agentic-cancel',
  label: 'Agentic cancel',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) =>
    method === 'POST'
    && (
      /^\/api\/items\/[^/]+\/agentic\/cancel$/.test(path)
      || /^\/api\/item-refs\/[^/]+\/agentic\/cancel$/.test(path)
    ),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic cancel called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const route = parseAgenticCancelRoute(req.url);
    const itemId = route?.itemId ? route.itemId.trim() : '';
    if (!itemId) {
      console.warn('Agentic cancel missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }
    if (route?.legacyRoute) {
      console.warn('[agentic-cancel] Legacy /api/items route used for cancel', { itemId, path: req.url });
    }
    if (itemId.startsWith('I-')) {
      console.warn('[agentic-cancel] Rejecting ItemUUID for agentic cancel', { itemId, legacyRoute: route?.legacyRoute });
      return sendJson(res, 400, { error: 'ItemUUID not supported for agentic cancel' });
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
    const reason = typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : null;
    if (!actor) {
      console.warn('Agentic cancel missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }

    const requestContext = resolveAgenticRequestContext(payload, itemId);

    try {
      const result = await cancelAgenticRun(
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
