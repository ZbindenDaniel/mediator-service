import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { setAgenticFlag, type AgenticFlagKey } from '../agentic';
import { resolveActor } from '../utils/actor';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const VALID_FLAGS: AgenticFlagKey[] = ['autoApprove', 'autoRework', 'autoReview'];

// Admin lever: flip an auto-flag (AUTO_APPROVE/REWORK/REVIEW) at runtime. The change takes effect on the
// next dispatch tick (the dispatcher reads the config objects live) and is persisted in system_settings
// so it survives a restart. Admin-gated — these flags gate what the pipeline does to the catalogue
// unattended, so toggling them is a privileged action, like the dispatch kill switch.
const action = defineHttpAction({
  feature: 'agentic',
  key: 'admin-agentic-flags',
  label: 'Admin: Agentic Auto-Flags',
  appliesTo: () => false,
  matches: (path: string, method: string) => path === '/api/admin/agentic-flags' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!requireAdminAuth(req, res)) return;

    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const flag = (parsed as { flag?: unknown })?.flag;
    const enabled = (parsed as { enabled?: unknown })?.enabled;
    if (typeof flag !== 'string' || !VALID_FLAGS.includes(flag as AgenticFlagKey)) {
      sendJson(res, 400, { error: `flag must be one of ${VALID_FLAGS.join(', ')}` });
      return;
    }
    if (typeof enabled !== 'boolean') {
      sendJson(res, 400, { error: 'enabled must be a boolean' });
      return;
    }
    try {
      await setAgenticFlag(flag as AgenticFlagKey, enabled);
      // Audit trail: these flags change what the pipeline does to the catalogue unattended.
      try {
        await ctx?.logEvent?.({
          Actor: resolveActor(ctx, '') || 'admin',
          EntityType: 'Batch',
          EntityId: 'agentic-flags',
          Event: 'AgenticFlagChanged',
          Meta: JSON.stringify({ flag, enabled })
        });
      } catch (logErr) {
        console.error('[admin-agentic-flags] Failed to log flag change', logErr);
      }
      sendJson(res, 200, { flag, enabled });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  },
  view: () => ''
});

export default action;
