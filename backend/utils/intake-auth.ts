import type { IncomingMessage, ServerResponse } from 'http';
import { INTAKE_TOKEN } from '../config';

export function requireIntakeAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!INTAKE_TOKEN) return true;
  const token = (req.headers['x-intake-token'] as string | undefined || '').trim();
  if (token === INTAKE_TOKEN) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}
