import { listTenantsForAdmin, listTenantSites } from '../db';
import type { TenantAdminRow, TenantSiteRow } from '../db';
import { setTenantDirectory } from './identity';
import { shelfLocations } from '../../models/shelf-locations';

// In-memory directory of orgs + sites (docs/PLANNING_TENANCY.md §2a). The DB is authoritative;
// identity resolution runs per request and synchronously, so it reads this cache, which every admin
// write refreshes (same pattern as taxonomy's reloadTaxonomyFromDb).

export interface Site {
  id: string;
  tenantId: string | null;
  label: string;
  floors: string[];
}

// Until the first DB load: the old hardcoded sites, unassigned, so shelf labels keep working.
let sites: Site[] = shelfLocations.map((s) => ({ id: s.id, tenantId: null, label: s.label, floors: [...s.floors] }));
let tenants: TenantAdminRow[] = [];

export function getSites(): Site[] {
  return sites;
}

export function getSite(id: string): Site | null {
  return sites.find((s) => s.id === id) ?? null;
}

/**
 * Whether a user may create shelves on this site: unassigned sites are open to everyone, an org's
 * sites only to its members, and platform admins (support) may use any.
 */
export function canUseSite(
  site: Site,
  identity: { tenant: string | null; role: string | null } | null | undefined
): boolean {
  if (!site.tenantId) return true;
  if (identity?.role === 'platform-admin') return true;
  return identity?.tenant === site.tenantId;
}

export function getTenantRows(): TenantAdminRow[] {
  return tenants;
}

function toSite(row: TenantSiteRow): Site {
  return {
    id: row.Id,
    tenantId: row.TenantId,
    label: row.Label,
    floors: Array.isArray(row.Floors) ? row.Floors.map(String) : []
  };
}

/** Reloads orgs + sites from the DB and hands the org→group links to identity resolution. */
export async function reloadTenantsFromDb(): Promise<void> {
  const [tenantRows, siteRows] = await Promise.all([listTenantsForAdmin(), listTenantSites()]);
  tenants = tenantRows;
  sites = siteRows.map(toSite);
  setTenantDirectory(
    tenantRows
      .filter((t) => t.Active && t.AuthentikGroup)
      .map((t) => ({
        id: t.Id,
        label: t.Label ?? undefined,
        group: t.AuthentikGroup as string,
        superGroup: t.AuthentikSuperGroup ?? undefined
      }))
  );
}

// Ids end up in URLs (and, for sites/floors, in shelf ids S-<site>-<floor>-<n>), so keep them to
// safe characters. Site and floor ids must never contain '-', which separates shelf id segments.
export const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const SITE_ID_PATTERN = /^[A-Z0-9]{1,12}$/;
export const FLOOR_PATTERN = /^[A-Za-z0-9]{1,6}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
