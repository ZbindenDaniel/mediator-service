import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { resolveIdentity } from '../lib/identity';

// Admin-panel access probe (docs/PLANNING_TENANCY.md §7 M1). Gated at the tenant-admin tier
// (requireAdminAuth), so both tenant admins and super admins get 200 — unlike the deployment-wide
// endpoints. Returns the caller's tier so the panel can show the super-admin-only sections only to
// super admins. The break-glass token and local-dev-no-login both resolve to 'super-admin' (full
// access, as before). Enforcement still lives on each endpoint; this only drives what the UI offers.
const action = defineHttpAction({
  key: 'admin-access',
  label: 'Admin access probe',
  appliesTo: () => false,
  matches: (p, m) => p === '/api/admin/access' && m === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;
    const identity = resolveIdentity(req);
    // Only a forward-auth `super` is a tenant admin; platform-admin, the ADMIN_SECRET bearer, and
    // local dev (no role) all get the full super-admin panel.
    const tier = identity.role === 'super' ? 'tenant-admin' : 'super-admin';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tier }));
  },
  view: () => '<div class="card"><p class="muted">Admin access API</p></div>'
});

export default action;
