import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { loadFeatures } from '../lib/features';

// Deployment config the frontend needs at boot (docs/PLANNING_NEW_USE_CASE.md §12.2). Today only the
// feature flags, so the UI hides what the backend blocks; one manifest, so the two can't drift.
const action = defineHttpAction({
  key: 'app-config',
  label: 'App config',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">App config API</p></div>',
  matches: (p, method) => p === '/api/app-config' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ features: loadFeatures() }));
  }
});

export default action;
