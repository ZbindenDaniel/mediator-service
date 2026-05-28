import type { IncomingMessage, ServerResponse } from 'http';
import { ADMIN_SECRET } from '../config';

export function requireAdminAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!ADMIN_SECRET) return true;
  const header = (req.headers.authorization || '').trim();
  if (header === `Bearer ${ADMIN_SECRET}`) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}
