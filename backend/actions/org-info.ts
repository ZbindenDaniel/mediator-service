import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getTenantRows } from '../lib/tenants';
import { configuredTenants } from '../lib/identity';

// Public card of an organisation for other orgs' users: shown where an item's location is replaced
// by its owner's name (tenancy 3b). Name + contact email only — ordering happens outside the tool
// by mail (meeting 2026-10-13); group links and sites stay admin-only.
const ORG_INFO_RE = /^\/api\/orgs\/([^/]+)$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'org-info',
  label: 'Organisation info',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Organisation info API</p></div>',
  matches: (p, method) => ORG_INFO_RE.test(p) && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse) {
    const match = (req.url || '').split('?')[0].match(ORG_INFO_RE);
    const id = match ? decodeURIComponent(match[1]).trim() : '';
    if (!id) return sendJson(res, 400, { error: 'invalid org id' });

    const row = getTenantRows().find((t) => t.Id === id);
    if (row) {
      return sendJson(res, 200, { id: row.Id, label: row.Label || row.Id, contactEmail: row.ContactEmail ?? null });
    }
    // Not in the DB directory (e.g. only the config's defaultTenant): name only.
    const configured = configuredTenants().find((t) => t.id === id);
    if (configured) return sendJson(res, 200, { id, label: configured.label || id, contactEmail: null });
    return sendJson(res, 404, { error: 'org not found' });
  }
});

export default action;
