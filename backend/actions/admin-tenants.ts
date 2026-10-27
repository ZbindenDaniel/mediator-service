import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireSuperAdminAuth } from '../utils/admin-auth';
import { loadConfigTenantGroupMap } from '../lib/identity';
import {
  EMAIL_PATTERN,
  FLOOR_PATTERN,
  SITE_ID_PATTERN,
  TENANT_ID_PATTERN,
  getSite,
  getSites,
  getTenantRows,
  reloadTenantsFromDb
} from '../lib/tenants';
import type { Site } from '../lib/tenants';
import type { TenantAdminRow } from '../db';
import {
  countShelvesOnSite,
  deleteTenantSite,
  insertTenant,
  insertTenantSite,
  updateTenant,
  updateTenantSite
} from '../db';

// Organisations admin (docs/PLANNING_TENANCY.md §2a): orgs (name, contact, linked Authentik
// groups) and their sites. Platform admins only. Ids are immutable (stamped on rows / encoded in
// shelf ids); orgs are deactivated rather than deleted because rows reference them. Every write
// reloads the in-memory directory, so logins and shelf creation see the change without a restart.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const parsed = raw ? JSON.parse(raw) : {};
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const optStr = (v: unknown): string | null => str(v) || null;

export interface TenantInput {
  label: string;
  contactEmail: string | null;
  authentikGroup: string | null;
  authentikSuperGroup: string | null;
}

/** Validates org fields; `selfId` excludes the org being edited from the group-uniqueness check. */
export function validateTenantInput(
  body: Record<string, unknown>,
  others: Pick<TenantAdminRow, 'Id' | 'AuthentikGroup' | 'AuthentikSuperGroup'>[],
  platformAdminGroup: string,
  selfId?: string
): { value: TenantInput } | { error: string } {
  const label = str(body.label);
  if (!label) return { error: 'Name ist erforderlich.' };
  const contactEmail = optStr(body.contactEmail);
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) return { error: 'Kontakt-E-Mail ist ungültig.' };
  const authentikGroup = optStr(body.authentikGroup);
  const authentikSuperGroup = optStr(body.authentikSuperGroup);
  if (authentikSuperGroup && !authentikGroup) return { error: 'Eine Admin-Gruppe braucht auch eine Benutzer-Gruppe.' };
  if (authentikGroup && authentikGroup === authentikSuperGroup) return { error: 'Benutzer- und Admin-Gruppe müssen verschieden sein.' };
  for (const g of [authentikGroup, authentikSuperGroup]) {
    if (!g) continue;
    if (g === platformAdminGroup) return { error: `"${g}" ist die Plattform-Admin-Gruppe und kann keiner Organisation gehören.` };
    // A group must point at exactly one org, or a login couldn't be resolved unambiguously.
    const clash = others.find((o) => o.Id !== selfId && (o.AuthentikGroup === g || o.AuthentikSuperGroup === g));
    if (clash) return { error: `Gruppe "${g}" ist bereits mit "${clash.Id}" verknüpft.` };
  }
  return { value: { label, contactEmail, authentikGroup, authentikSuperGroup } };
}

export interface SiteInput {
  label: string;
  floors: string[];
  tenantId: string | null;
}

export function validateSiteInput(
  body: Record<string, unknown>,
  tenantIds: Set<string>
): { value: SiteInput } | { error: string } {
  const label = str(body.label);
  if (!label) return { error: 'Bezeichnung ist erforderlich.' };
  const rawFloors = Array.isArray(body.floors) ? body.floors : [];
  const floors = rawFloors.map((f) => str(f)).filter(Boolean);
  if (floors.length === 0) return { error: 'Mindestens ein Stockwerk ist erforderlich.' };
  const badFloor = floors.find((f) => !FLOOR_PATTERN.test(f));
  if (badFloor !== undefined) return { error: `Stockwerk "${badFloor}": nur Buchstaben und Ziffern (max. 6), kein "-".` };
  if (new Set(floors).size !== floors.length) return { error: 'Stockwerke müssen eindeutig sein.' };
  const tenantId = optStr(body.tenantId);
  if (tenantId && !tenantIds.has(tenantId)) return { error: `Organisation "${tenantId}" existiert nicht.` };
  return { value: { label, floors, tenantId } };
}

function snapshot() {
  const sites = getSites();
  const tenants = getTenantRows().map((t) => ({
    id: t.Id,
    label: t.Label,
    active: t.Active,
    contactEmail: t.ContactEmail,
    authentikGroup: t.AuthentikGroup,
    authentikSuperGroup: t.AuthentikSuperGroup,
    sites: sites.filter((s) => s.tenantId === t.Id)
  }));
  return {
    tenants,
    unassignedSites: sites.filter((s) => !s.tenantId),
    platformAdminGroup: loadConfigTenantGroupMap().platformAdminGroup
  };
}

const TENANT_ROUTE = /^\/api\/admin\/tenants(?:\/([^/]+))?$/;
const SITE_ROUTE = /^\/api\/admin\/sites(?:\/([^/]+))?$/;

const action = defineHttpAction({
  key: 'admin-tenants',
  label: 'Admin: organisations',
  appliesTo: () => false,
  view: () => '<div class="card"><p class="muted">Admin organisations API</p></div>',
  matches: (p, method) =>
    (TENANT_ROUTE.test(p) && ['GET', 'POST', 'PUT'].includes(method))
    || (SITE_ROUTE.test(p) && ['POST', 'PUT', 'DELETE'].includes(method)),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireSuperAdminAuth(req, res)) return;
    const url = (req.url || '').split('?')[0];
    const method = req.method || 'GET';
    const tenantMatch = TENANT_ROUTE.exec(url);
    const siteMatch = SITE_ROUTE.exec(url);
    const platformAdminGroup = loadConfigTenantGroupMap().platformAdminGroup;

    try {
      if (tenantMatch && !tenantMatch[1] && method === 'GET') {
        sendJson(res, 200, snapshot());
        return;
      }

      if (tenantMatch && !tenantMatch[1] && method === 'POST') {
        const body = await readJson(req);
        const id = str(body.id);
        if (!TENANT_ID_PATTERN.test(id)) {
          sendJson(res, 400, { error: 'ID: Kleinbuchstaben, Ziffern, "-" oder "_" (max. 40), beginnend mit Buchstabe/Ziffer.' });
          return;
        }
        if (getTenantRows().some((t) => t.Id === id)) { sendJson(res, 409, { error: `Organisation "${id}" existiert bereits.` }); return; }
        const result = validateTenantInput(body, getTenantRows(), platformAdminGroup);
        if ('error' in result) { sendJson(res, 400, result); return; }
        await insertTenant({ id, ...result.value });
        await reloadTenantsFromDb();
        sendJson(res, 200, snapshot());
        return;
      }

      if (tenantMatch && tenantMatch[1] && method === 'PUT') {
        const id = decodeURIComponent(tenantMatch[1]);
        if (!getTenantRows().some((t) => t.Id === id)) { sendJson(res, 404, { error: `Organisation "${id}" nicht gefunden.` }); return; }
        const body = await readJson(req);
        const result = validateTenantInput(body, getTenantRows(), platformAdminGroup, id);
        if ('error' in result) { sendJson(res, 400, result); return; }
        await updateTenant(id, { ...result.value, active: body.active !== false });
        await reloadTenantsFromDb();
        sendJson(res, 200, snapshot());
        return;
      }

      const tenantIds = new Set(getTenantRows().map((t) => t.Id));

      if (siteMatch && !siteMatch[1] && method === 'POST') {
        const body = await readJson(req);
        const id = str(body.id).toUpperCase();
        if (!SITE_ID_PATTERN.test(id)) { sendJson(res, 400, { error: 'Standort-ID: Grossbuchstaben und Ziffern (max. 12), kein "-".' }); return; }
        if (getSite(id)) { sendJson(res, 409, { error: `Standort "${id}" existiert bereits.` }); return; }
        const result = validateSiteInput(body, tenantIds);
        if ('error' in result) { sendJson(res, 400, result); return; }
        await insertTenantSite({ id, ...result.value, sortOrder: getSites().length });
        await reloadTenantsFromDb();
        sendJson(res, 200, snapshot());
        return;
      }

      if (siteMatch && siteMatch[1] && method === 'PUT') {
        const id = decodeURIComponent(siteMatch[1]);
        const existing: Site | null = getSite(id);
        if (!existing) { sendJson(res, 404, { error: `Standort "${id}" nicht gefunden.` }); return; }
        const body = await readJson(req);
        const result = validateSiteInput(body, tenantIds);
        if ('error' in result) { sendJson(res, 400, result); return; }
        // Existing shelves carry their org and encode their floor, so neither may change under them.
        if (result.value.tenantId !== existing.tenantId && await countShelvesOnSite(id) > 0) {
          sendJson(res, 409, { error: 'Der Standort hat bereits Regale und kann keiner anderen Organisation zugewiesen werden.' });
          return;
        }
        for (const floor of existing.floors.filter((f) => !result.value.floors.includes(f))) {
          if (await countShelvesOnSite(id, floor) > 0) {
            sendJson(res, 409, { error: `Stockwerk "${floor}" hat bereits Regale und kann nicht entfernt werden.` });
            return;
          }
        }
        await updateTenantSite(id, result.value);
        await reloadTenantsFromDb();
        sendJson(res, 200, snapshot());
        return;
      }

      if (siteMatch && siteMatch[1] && method === 'DELETE') {
        const id = decodeURIComponent(siteMatch[1]);
        if (!getSite(id)) { sendJson(res, 404, { error: `Standort "${id}" nicht gefunden.` }); return; }
        if (await countShelvesOnSite(id) > 0) {
          sendJson(res, 409, { error: 'Der Standort hat Regale und kann nicht gelöscht werden.' });
          return;
        }
        await deleteTenantSite(id);
        await reloadTenantsFromDb();
        sendJson(res, 200, snapshot());
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof SyntaxError) { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }
      console.error('[admin-tenants] request failed', err);
      sendJson(res, 500, { error: 'Internal error' });
    }
  }
});

export default action;
