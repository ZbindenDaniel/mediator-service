import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { getSelfHealPreview, requestSelfHealSweep } from '../agentic';

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
    // POST = "run the sweep now": requests one forced sweep pass on the dispatcher's next tick, bypassing
    // the normal idle gate. Still respects the AUTO_REWORK/AUTO_REVIEW flags (an off slice does nothing).
    if (req.method === 'POST') {
      requestSelfHealSweep();
      sendJson(res, 202, { requested: true });
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
