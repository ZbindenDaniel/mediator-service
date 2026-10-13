import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { configuredTenants } from '../lib/identity';
import type { RequestIdentity } from '../lib/identity';

// Observable identity endpoint (docs/PLANNING_TENANCY.md Phase 1). Returns the identity the
// backend resolved from the forward-auth headers for THIS request, so the tenancy plumbing can be
// verified end-to-end (curl behind the proxy, or with mocked X-authentik-* headers) without any
// data-scoping being in place yet. Open like the other read endpoints — it only ever reveals the
// caller's own resolved identity, never anyone else's.
const action = defineHttpAction({
  key: 'whoami',
  label: 'Who am I',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Identity API</p></div>',
  matches: (p, method) => p === '/api/whoami' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: { identity?: RequestIdentity }) {
    // ctx.identity is always populated at the dispatch chokepoint; guard defensively so the route
    // never 500s if invoked outside the normal server wiring (e.g. a stripped-down test harness).
    const identity: RequestIdentity = ctx?.identity ?? {
      authenticated: false, username: null, groups: [], tenant: null, role: null
    };
    // Display name for the user settings dialog; from the config map, which is what seeds the
    // tenants registry, so no DB round trip is needed.
    const tenantLabel = identity.tenant
      ? configuredTenants().find((t) => t.id === identity.tenant)?.label ?? null
      : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ identity, tenantLabel }));
  }
});

export default action;
