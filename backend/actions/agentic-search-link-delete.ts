import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { removeAgenticSearchLink } from '../agentic';
import { resolveAgenticRequestContext } from './agentic-request-context';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseAgenticSearchLinkRoute(path: string): { itemId: string; legacyRoute: boolean } | null {
  const legacyMatch = path.match(/^\/api\/items\/([^/]+)\/agentic\/search-links\/delete$/);
  if (legacyMatch) {
    return { itemId: decodeURIComponent(legacyMatch[1]), legacyRoute: true };
  }
  const refMatch = path.match(/^\/api\/item-refs\/([^/]+)\/agentic\/search-links\/delete$/);
  if (refMatch) {
    return { itemId: decodeURIComponent(refMatch[1]), legacyRoute: false };
  }
  return null;
}

const action = defineHttpAction({
  key: 'agentic-search-link-delete',
  label: 'Agentic search link delete',
  appliesTo: (entity) => entity.type === 'Item',
  matches: (path, method) =>
    method === 'POST'
    && (
      /^\/api\/items\/[^/]+\/agentic\/search-links\/delete$/.test(path)
      || /^\/api\/item-refs\/[^/]+\/agentic\/search-links\/delete$/.test(path)
    ),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!req.url) {
      console.warn('Agentic search link delete called without URL');
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    const route = parseAgenticSearchLinkRoute(req.url);
    const itemId = route?.itemId ? route.itemId.trim() : '';
    if (!itemId) {
      console.warn('Agentic search link delete missing item id');
      return sendJson(res, 400, { error: 'Invalid item id' });
    }
    if (route?.legacyRoute) {
      console.warn('[agentic-search-link-delete] Legacy /api/items route used', { itemId, path: req.url });
    }

    let rawBody = '';
    try {
      for await (const chunk of req) rawBody += chunk;
    } catch (err) {
      console.error('Failed to read agentic search link delete payload', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    let payload: any = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse agentic search link delete payload', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!actor) {
      console.warn('Agentic search link delete missing actor');
      return sendJson(res, 400, { error: 'actor is required' });
    }
    if (!url) {
      console.warn('Agentic search link delete missing url');
      return sendJson(res, 400, { error: 'url is required' });
    }

    const requestContext = resolveAgenticRequestContext(payload, itemId);

    try {
      const result = await removeAgenticSearchLink(
        { itemId, actor, url, request: requestContext },
        {
          getAgenticRun: ctx.getAgenticRun,
          getItemReference: ctx.getItemReference,
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          logger: console,
          now: () => new Date()
        }
      );

      if (!result.removed) {
        if (result.reason === 'not-found') {
          return sendJson(res, 404, { error: 'Agentic run not found' });
        }
        if (result.reason === 'link-not-found') {
          return sendJson(res, 404, { error: 'Search link not found', reason: result.reason });
        }
        return sendJson(res, 400, { error: 'Unable to remove search link', reason: result.reason ?? null });
      }

      return sendJson(res, 200, { agentic: result.agentic, remaining: result.remaining ?? 0 });
    } catch (err) {
      console.error('Failed to remove agentic search link', err);
      return sendJson(res, 500, { error: 'Failed to remove agentic search link' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic search link delete API</p></div>'
});

export default action;
