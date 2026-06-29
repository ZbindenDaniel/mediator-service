import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getUserMarks, markItem, unmarkItem, getUserMark, getItemMarks, getAllMarkedItemUUIDs } from '../db';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const action = defineHttpAction({
  key: 'user-marks',
  label: 'User item marks',
  appliesTo: () => false,
  matches: (path, method) =>
    (path === '/api/user-marks' || path.startsWith('/api/user-marks?') || path.startsWith('/api/user-marks/item/') || path === '/api/user-marks/all')
    && ['GET', 'POST', 'DELETE'].includes(method),

  async handle(req: IncomingMessage, res: ServerResponse) {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/api/user-marks/all') {
      const uuids = await getAllMarkedItemUUIDs();
      return sendJson(res, 200, { markedUUIDs: uuids });
    }

    if (method === 'GET' && url.pathname.startsWith('/api/user-marks/item/')) {
      const itemUUID = url.pathname.replace('/api/user-marks/item/', '').trim();
      if (!itemUUID) return sendJson(res, 400, { error: 'itemUUID is required' });
      const marks = await getItemMarks(itemUUID);
      return sendJson(res, 200, { marks });
    }

    if (method === 'GET') {
      const username = url.searchParams.get('username')?.trim() || '';
      if (!username) return sendJson(res, 400, { error: 'username is required' });
      const marks = await getUserMarks(username);
      return sendJson(res, 200, {
        markedUUIDs: marks.map((m) => m.ItemUUID),
        marks: marks.map((m) => ({ itemUUID: m.ItemUUID, note: m.Note }))
      });
    }

    const body = await readJson(req) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const itemUUID = typeof body.itemUUID === 'string' ? body.itemUUID.trim() : '';

    if (!username || !itemUUID) {
      return sendJson(res, 400, { error: 'username and itemUUID are required' });
    }

    if (method === 'POST') {
      const note = typeof body.note === 'string' ? body.note.trim() || null : null;
      await markItem(username, itemUUID, note);
      const saved = await getUserMark(username, itemUUID);
      return sendJson(res, 200, { ok: true, note: saved?.Note ?? null });
    }

    if (method === 'DELETE') {
      await unmarkItem(username, itemUUID);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  },

  view: () => '<div class="card"><p class="muted">User marks API</p></div>'
});

export default action;
