import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getItemCategories } from '../lib/taxonomy';

// Public read model of the category taxonomy for the frontend (Phase 2 consumes
// this instead of importing the shared TS). Open, like the other read endpoints.
const action = defineHttpAction({
  key: 'taxonomy',
  label: 'Taxonomy',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Taxonomy API</p></div>',
  matches: (p, method) => p === '/api/taxonomy' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    const categories = getItemCategories();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ categories }));
  }
});

export default action;
