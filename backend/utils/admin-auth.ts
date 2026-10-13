import type { IncomingMessage, ServerResponse } from 'http';
import { ADMIN_SECRET } from '../config';
import { resolveIdentity } from '../lib/identity';

// Admin access (docs/PLANNING_TENANCY.md §5.5): a logged-in platform admin, or the ADMIN_SECRET
// bearer as break-glass. Identity is resolved from the forward-auth headers here rather than taken
// from ctx so the existing requireAdminAuth(req, res) call sites stay unchanged.
export function requireAdminAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const identity = resolveIdentity(req);
  if (identity.role === 'platform-admin') return true;
  const header = (req.headers.authorization || '').trim();
  if (ADMIN_SECRET && header === `Bearer ${ADMIN_SECRET}`) return true;
  // No secret and no login = local dev without a proxy: stay open as before. A logged-in
  // non-admin is never let through, even when no secret is configured.
  if (!ADMIN_SECRET && !identity.authenticated) return true;
  const status = identity.authenticated ? 403 : 401;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }));
  return false;
}
