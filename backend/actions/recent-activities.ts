import { URL } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import { defineHttpAction } from './index';
import { EVENT_LOG_LEVELS } from '../../models/event-log';
import { EVENT_TOPICS } from '../../models/event-labels';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Raised from 50/200: operators want a usable history window, and the cursor makes deeper pages cheap.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseList(raw: string | null, allowed: readonly string[]): string[] {
  if (!raw) return [];
  const byLower = new Map(allowed.map((value) => [value.toLowerCase(), value]));
  const parsed: string[] = [];
  for (const token of raw.split(',')) {
    const match = byLower.get(token.trim().toLowerCase());
    if (match && !parsed.includes(match)) parsed.push(match);
  }
  return parsed;
}

/**
 * GET /api/activities
 *   ?limit=1..500 (default 100)  &before=<cursor from nextCursor>
 *   &term=  &boxId=  &actor=
 *   &topics=logistics,agentic    (event-resources topics)
 *   &levels=Important,Error      (EventLogLevel names; omitted = all levels incl. Debug)
 * → { events, nextCursor }  — nextCursor is null on the last page.
 */
const action = defineHttpAction({
  feature: 'logs',
  key: 'recent-activities',
  label: 'Recent activities',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/activities' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url || '/', PUBLIC_ORIGIN);
      const param = (name: string) => (url.searchParams.get(name) ?? '').trim();

      const requestedLimit = param('limit');
      const parsedLimit = requestedLimit ? Number(requestedLimit) : DEFAULT_LIMIT;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(1, Math.floor(parsedLimit)), MAX_LIMIT)
        : DEFAULT_LIMIT;

      const topicsRaw = url.searchParams.get('topics');
      const levelsRaw = url.searchParams.get('levels');
      const topics = parseList(topicsRaw, EVENT_TOPICS);
      const levels = parseList(levelsRaw, EVENT_LOG_LEVELS);
      if (topicsRaw && topics.length === 0) {
        console.warn('[activities] No recognized topics in filter; ignoring', { topics: topicsRaw });
      }
      if (levelsRaw && levels.length === 0) {
        console.warn('[activities] No recognized levels in filter; ignoring', { levels: levelsRaw });
      }

      const page = await ctx.listActivities({
        limit,
        before: param('before') || null,
        actor: param('actor') || null,
        term: param('term') || param('query') || null,
        boxId: param('boxId') || null,
        topics,
        levels
      });

      sendJson(res, 200, { events: page.events, nextCursor: page.nextCursor });
    } catch (err) {
      console.error('Activities endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Activities API</p></div>'
});

export default action;
