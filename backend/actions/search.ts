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
      const term =
        url.searchParams.get('term') ||
        url.searchParams.get('q') ||
        url.searchParams.get('material') ||
        '';
      if (!term) return sendJson(res, 400, { error: 'query term is required' });
      const trimmed = term.trim();
      if (!trimmed) {
        return sendJson(res, 400, { error: 'query term is required' });
      }
      const wildcardTerm = trimmed.replace(/\s+/g, '%');
      const like = `%${wildcardTerm}%`;
      const items = ctx.db
        .prepare(
          `SELECT i.*, COALESCE(i.Location, b.Location) AS Location
           FROM items i
           LEFT JOIN boxes b ON i.BoxID = b.BoxID
           WHERE i.ItemUUID LIKE ?
              OR i.Artikel_Nummer LIKE ?
              OR i.Artikelbeschreibung LIKE ?
              OR i.BoxID LIKE ?
              OR b.Location LIKE ?`
        )
        .all(like, like, like, like, like);
      const boxes = ctx.db
        .prepare('SELECT BoxID, Location FROM boxes WHERE BoxID LIKE ? OR Location LIKE ?')
        .all(like, like);
      console.log('search', term, '→ pattern', like, '→', items.length, 'items', boxes.length, 'boxes');
      sendJson(res, 200, { items, boxes });
    } catch (err) {
      console.error('Search failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Search API</p></div>'
};

export default action;
