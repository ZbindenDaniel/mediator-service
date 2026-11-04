import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getPipelineCockpit } from '../agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// The KI cockpit read model: pipeline state + levers in one round-trip (flags, thresholds, live queue,
// self-heal backlog). Operator-visible (agentic feature), not admin — seeing the pipeline's health is not
// a privileged action. The write levers (flag toggles, sweep-now, dispatch switch) stay admin-gated on
// their own endpoints.
const action = defineHttpAction({
  feature: 'agentic',
  key: 'agentic-cockpit',
  label: 'Agentic Cockpit',
  appliesTo: () => false,
  matches: (path: string, method: string) => path === '/api/agentic/cockpit' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    try {
      const cockpit = await getPipelineCockpit(console);
      sendJson(res, 200, cockpit);
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  },
  view: () => ''
});

export default action;
