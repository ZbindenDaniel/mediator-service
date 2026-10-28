import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { loadFeatures } from '../lib/features';
import { getSites } from '../lib/tenants';

// Deployment config the frontend needs at boot (docs/PLANNING_NEW_USE_CASE.md §12.2): the feature
// flags (so the UI hides what the backend blocks) and the warehouse sites (shelf labels + shelf
// creation; they used to be compiled into the frontend).
const action = defineHttpAction({
  key: 'app-config',
  label: 'App config',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">App config API</p></div>',
  matches: (p, method) => p === '/api/app-config' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ features: loadFeatures(), sites: getSites() }));
  }
});

export default action;
