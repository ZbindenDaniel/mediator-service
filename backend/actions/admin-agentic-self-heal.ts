import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { getSelfHealPreview, requestSelfHealSweep, runSelfHealSweepNow } from '../agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Admin read: the self-heal backlog the idle sweep sees — per-action counts (rework/restamp/reword/rerun),
// a status breakdown, the current standards version and the flag states. Makes "why isn't the sweep doing
// anything?" answerable at a glance: staleCount 0 means nothing is stale (bump a contract/standards
// version to trigger it), a flag shown false means that slice won't act even if items are stale.
const action = defineHttpAction({
  feature: 'agentic',
  key: 'admin-agentic-self-heal',
  label: 'Admin: Agentic Self-Heal Preview',
  appliesTo: () => false,
  matches: (path: string, method: string) =>
    path === '/api/admin/agentic-self-heal' && (method === 'GET' || method === 'POST'),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    // POST = "run the sweep now": executes sweep passes SYNCHRONOUSLY and reports what happened, so the
    // operator gets immediate, unambiguous feedback instead of a deferred "will run next tick". Also sets
    // the force flag as a belt-and-braces fallback for the next tick. Still respects the flags.
    if (req.method === 'POST') {
      requestSelfHealSweep();
      try {
        const { passes, warmedUp } = await runSelfHealSweepNow(5);
        if (!warmedUp) {
          // The dispatcher hasn't run a tick yet (no deps captured) — the force flag will catch the next one.
          sendJson(res, 202, { requested: true, warmedUp: false, note: 'dispatcher not warmed up yet; will run on the next tick' });
          return;
        }
        const enqueued = passes.filter((p) => p.acted === 'rework' || p.acted === 'reword' || p.acted === 'rerun');
        const restamped = passes.reduce((n, p) => n + (p.restamped ?? 0), 0);
        sendJson(res, 200, {
          requested: true,
          warmedUp: true,
          staleCount: passes[0]?.staleCount ?? 0,
          reason: passes[0]?.reason ?? null,
          enqueued: enqueued.map((p) => ({ artikelNummer: p.artikelNummer, acted: p.acted })),
          restamped,
          passes
        });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    try {
      const preview = await getSelfHealPreview(100);
      sendJson(res, 200, preview);
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  },
  view: () => ''
});

export default action;
