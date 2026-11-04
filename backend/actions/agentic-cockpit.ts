import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getPipelineCockpit, getPipelineFindingsAggregate } from '../agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// The KI cockpit read models, both operator-visible (agentic feature) — seeing the pipeline's state is not
// a privileged action. The write levers (flag toggles, sweep-now, dispatch switch) stay admin-gated on
// their own endpoints.
//   GET /api/agentic/cockpit          → levers + health (flags, thresholds, queue, self-heal backlog)
//   GET /api/agentic/cockpit/findings → findings aggregation + status distribution (the heavier scan,
//                                        split off so the levers strip loads fast)
const action = defineHttpAction({
  feature: 'agentic',
  key: 'agentic-cockpit',
  label: 'Agentic Cockpit',
  appliesTo: () => false,
  matches: (path: string, method: string) =>
    (path === '/api/agentic/cockpit' || path === '/api/agentic/cockpit/findings') && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      if ((req.url ?? '').startsWith('/api/agentic/cockpit/findings')) {
        sendJson(res, 200, await getPipelineFindingsAggregate(40));
        return;
      }
      sendJson(res, 200, await getPipelineCockpit(console));
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  },
  view: () => ''
});

export default action;
