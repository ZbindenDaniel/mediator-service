import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { buildPartsTree } from '../lib/parts-tree';

// GET /api/items/:uuid/parts-tree — the Einzelteile page: slots, stored answers and linked parts,
// recursively (lib/parts-tree), in one call so both panels share one snapshot.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const PARTS_TREE_ROUTE = /^\/api\/items\/([^/]+)\/parts-tree$/;

const action = defineHttpAction({
  key: 'parts-tree',
  label: 'Parts tree',
  appliesTo: () => false,
  matches: (path, method) => PARTS_TREE_ROUTE.test(path) && method === 'GET',

  async handle(req: IncomingMessage, res: ServerResponse) {
    const uuid = decodeURIComponent(((req.url || '').split('?')[0]).match(PARTS_TREE_ROUTE)![1]);
    const tree = await buildPartsTree(uuid);
    if (!tree) return sendJson(res, 404, { error: 'item not found' });
    return sendJson(res, 200, { tree });
  },
  view: () => '<div class="card"><p class="muted">Parts tree API</p></div>'
});

export default action;
