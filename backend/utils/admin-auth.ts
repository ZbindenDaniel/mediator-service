import type { IncomingMessage, ServerResponse } from 'http';
import { ADMIN_SECRET } from '../config';
import { resolveIdentity } from '../lib/identity';

// Admin access (docs/PLANNING_TENANCY.md §5.5, §7 M1). Two tiers share one check:
//   - requireAdminAuth      — the admin panel + operational cards: tenant admin (`super`) or above.
//   - requireSuperAdminAuth — deployment-wide controls (orgs, taxonomy, feature flags, ERP/Shopware
//                             wiring, printer config): platform admin only.
// Both accept the ADMIN_SECRET bearer as break-glass, and both stay open for local dev with no
// secret and no login. Identity is resolved from the forward-auth headers here (not from ctx) so the
// existing call sites stay unchanged.
function checkAdmin(req: IncomingMessage, res: ServerResponse, allowTenantAdmin: boolean): boolean {
  const identity = resolveIdentity(req);
  if (identity.role === 'platform-admin') return true;
  if (allowTenantAdmin && identity.role === 'super') return true;
  const header = (req.headers.authorization || '').trim();
  if (ADMIN_SECRET && header === `Bearer ${ADMIN_SECRET}`) return true;
  // No secret and no login = local dev without a proxy: stay open as before. A logged-in
  // non-admin (or a tenant admin at a super-admin-only endpoint) is never let through.
  if (!ADMIN_SECRET && !identity.authenticated) return true;
  const status = identity.authenticated ? 403 : 401;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }));
  return false;
}

/** Admin panel + operational endpoints: tenant admin (`super`) or above. */
export function requireAdminAuth(req: IncomingMessage, res: ServerResponse): boolean {
  return checkAdmin(req, res, true);
}

/** Deployment-wide controls (orgs, taxonomy, feature flags, ERP/Shopware, printers): platform admin only. */
export function requireSuperAdminAuth(req: IncomingMessage, res: ServerResponse): boolean {
  return checkAdmin(req, res, false);
}
