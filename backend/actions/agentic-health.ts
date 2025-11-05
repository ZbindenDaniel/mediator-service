import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { checkAgenticHealth } from '../agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'agentic-health',
  label: 'Agentic health proxy',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/health' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const health = checkAgenticHealth({
        db: ctx.db,
        getAgenticRun: ctx.getAgenticRun,
        upsertAgenticRun: ctx.upsertAgenticRun,
        updateAgenticRunStatus: ctx.updateAgenticRunStatus,
        logEvent: ctx.logEvent,
        logger: console,
        now: () => new Date()
      });

      sendJson(res, health.ok ? 200 : 503, { ok: health.ok, details: health });
    } catch (err) {
      console.error('[agentic-health] Unexpected error while computing health', err);
      sendJson(res, 500, { ok: false, error: 'Failed to fetch agentic health status' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic health proxy API</p></div>'
};

export default action;
