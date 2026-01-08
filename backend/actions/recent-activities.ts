import { URL } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// TODO(agent): Revisit recent activity search filtering once UI wiring is finalized.
// TODO(agent): Include active topic allow list details in diagnostics metadata responses.
const action = defineHttpAction({
  key: 'recent-activities',
  label: 'Recent activities',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/activities' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const requestUrl = new URL(req.url || '/', PUBLIC_ORIGIN);
      const requestedLimit = requestUrl.searchParams.get('limit');
      const rawTerm = requestUrl.searchParams.get('term') ?? requestUrl.searchParams.get('query');
      const normalizedTerm = rawTerm ? rawTerm.trim() : '';
      const hasTerm = normalizedTerm.length > 0;
      const parsedLimit = requestedLimit ? Number(requestedLimit) : DEFAULT_LIMIT;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(1, Math.floor(parsedLimit)), MAX_LIMIT)
        : DEFAULT_LIMIT;

      const events = hasTerm
        ? ctx.listRecentActivitiesByTerm.all({ limit, term: `%${normalizedTerm}%` })
        : ctx.listRecentActivities.all({ limit });
      if (hasTerm) {
        console.info('Activities feed filtered by search term', { term: normalizedTerm, limit });
      }
      try {
        const totalEvents = ctx.countEvents.get().c || 0;
        if (totalEvents > limit) {
          console.info('Activities feed truncated to requested limit', {
            limit,
            total: totalEvents
          });
        }
      } catch (err) {
        console.error('Failed to determine total event count for activities feed', err);
      }

      if (requestedLimit && Number.isFinite(parsedLimit) && parsedLimit !== limit) {
        console.info('Activities limit adjusted to safe bounds', {
          requested: parsedLimit,
          applied: limit
        });
      }

      sendJson(res, 200, { events });
    } catch (err) {
      console.error('Activities endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Activities API</p></div>'
});

export default action;
