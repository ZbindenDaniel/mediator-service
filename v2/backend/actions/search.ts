import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'search',
  label: 'Search',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/search' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      const term = url.searchParams.get('term') || '';
      if (!term) return sendJson(res, 400, { error: 'term query is required' });
      const like = `%${term}%`;
      const items = ctx.db
        .prepare('SELECT * FROM items WHERE Artikel_Nummer LIKE ? OR Artikelbeschreibung LIKE ?')
        .all(like, like);
      console.log('search', term, '→', items.length, 'items');
      sendJson(res, 200, { items });
    } catch (err) {
      console.error('Search failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Search API</p></div>'
};

export default action;
