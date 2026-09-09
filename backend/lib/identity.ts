import fs from 'fs';

// Forward-auth identity (see docs/PLANNING_TENANCY.md Phase 1). The reverse proxy authenticates
// via the Authentik outpost and injects X-authentik-username / X-authentik-groups; this resolves
// those headers into { user, tenant, role } for the per-request ctx. A config-driven
// group -> {tenant, role} map (not hardcoded) keeps extra tenants/roles to config lines.
//
// SECURITY: these headers are trusted, so the proxy MUST strip any client-supplied copies and let
// only the outpost set them. Enforced in the proxy config (Phase 1), not here.

export type Role = 'platform-admin' | 'super' | 'normal';

export interface RequestIdentity {
  authenticated: boolean;
  username: string | null;
  groups: string[];
  tenant: string | null;
  role: Role | null;
}

export interface TenantMapEntry {
  id: string;
  label?: string;
  group: string;        // Authentik group whose members belong to this tenant
  superGroup?: string;  // members are tenant admins (super) of this tenant
}
export interface TenantGroupMap {
  platformAdminGroup: string;   // members are platform admins (cross-tenant)
  tenants: TenantMapEntry[];
  defaultTenant: string | null; // fallback tenant when no group matches (e.g. legacy/single-tenant)
}

const DEFAULT_MAP: TenantGroupMap = { platformAdminGroup: 'mediator-admin', tenants: [], defaultTenant: null };

let cachedMap: TenantGroupMap | null = null;

function parseMapFromEnv(): TenantGroupMap {
  const inline = (process.env.TENANT_GROUP_MAP || '').trim();
  const file = (process.env.TENANT_GROUP_MAP_FILE || '').trim();
  let raw: string | null = null;
  if (inline) raw = inline;
  else if (file) {
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (err) { console.warn(`[identity] TENANT_GROUP_MAP_FILE "${file}" unreadable — using defaults.`, err); }
  }
  if (!raw) return { ...DEFAULT_MAP };
  try {
    const p = JSON.parse(raw) as Partial<TenantGroupMap>;
    return {
      platformAdminGroup: typeof p.platformAdminGroup === 'string' && p.platformAdminGroup.trim()
        ? p.platformAdminGroup.trim() : DEFAULT_MAP.platformAdminGroup,
      tenants: Array.isArray(p.tenants)
        ? p.tenants
            .filter((t): t is TenantMapEntry => !!t && typeof t.id === 'string' && typeof t.group === 'string')
            .map((t) => ({ id: t.id, label: t.label, group: t.group, superGroup: t.superGroup }))
        : [],
      defaultTenant: typeof p.defaultTenant === 'string' && p.defaultTenant.trim() ? p.defaultTenant.trim() : null
    };
  } catch (err) {
    console.warn('[identity] TENANT_GROUP_MAP is not valid JSON — using defaults.', err);
    return { ...DEFAULT_MAP };
  }
}

export function loadTenantGroupMap(): TenantGroupMap {
  if (!cachedMap) cachedMap = parseMapFromEnv();
  return cachedMap;
}
export function resetTenantGroupMapCache(): void { cachedMap = null; }

/**
 * The tenants declared in the config group map, deduped by id — the source of truth for seeding the
 * local `tenants` registry at startup (docs/PLANNING_TENANCY.md Phase 2b). Includes `defaultTenant`
 * (the legacy/single-tenant fallback) when it isn't already listed. The platform-admin group is a
 * role, not a tenant, so it is not emitted here.
 */
export function configuredTenants(map: TenantGroupMap = loadTenantGroupMap()): { id: string; label: string | null }[] {
  const byId = new Map<string, { id: string; label: string | null }>();
  for (const t of map.tenants) {
    const id = (t.id || '').trim();
    if (id) byId.set(id, { id, label: (t.label || '').trim() || null });
  }
  const def = (map.defaultTenant || '').trim();
  if (def && !byId.has(def)) byId.set(def, { id: def, label: null });
  return [...byId.values()];
}

function firstHeader(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}
function parseGroups(v: unknown): string[] {
  if (!v) return [];
  const s = Array.isArray(v) ? v.join('|') : String(v);
  return s.split(/[|,]/).map((g) => g.trim()).filter(Boolean); // Authentik commonly uses '|'; also accept ','
}

const ANON: RequestIdentity = { authenticated: false, username: null, groups: [], tenant: null, role: null };

/** Resolves forward-auth headers into a RequestIdentity. Missing headers (e.g. dev without a proxy) → unauthenticated. */
export function resolveIdentity(
  req: { headers?: Record<string, unknown> },
  map: TenantGroupMap = loadTenantGroupMap()
): RequestIdentity {
  const h = req.headers || {};
  const username = firstHeader(h['x-authentik-username']);
  if (!username) {
    // No proxy identity yet — surface the default tenant (if configured) but stay unauthenticated.
    return { ...ANON, tenant: map.defaultTenant };
  }
  const groups = parseGroups(h['x-authentik-groups']);
  const isPlatformAdmin = groups.includes(map.platformAdminGroup);
  const matched = map.tenants.find((t) => groups.includes(t.group)) ?? null;
  const tenant = matched?.id ?? map.defaultTenant;
  let role: Role | null;
  if (isPlatformAdmin) role = 'platform-admin';
  else if (matched?.superGroup && groups.includes(matched.superGroup)) role = 'super';
  else role = tenant ? 'normal' : null;
  return { authenticated: true, username, groups, tenant, role };
}
