import { AsyncLocalStorage } from 'async_hooks';
import type { RequestIdentity } from './identity';
import { loadConfigTenantGroupMap } from './identity';

// Tenancy write rules (docs/PLANNING_TENANCY.md §2a, Phase 3). The single place that decides who may
// change a row, so later changes (org groups / shared warehouses, different reference rights) stay
// here instead of in every handler.
//
// owner(row) = row.TenantId ?? defaultTenant — rows without an owner belong to the deployment's
// default org, so an existing single-org deployment joins tenancy by setting defaultTenant, with no
// data migration.
//
// Unrestricted: requests without a login (Basic Auth deployments, i.e. the live system keeps its
// behaviour), platform admins, and work outside any request (background jobs).

export function defaultTenant(): string | null {
  return loadConfigTenantGroupMap().defaultTenant;
}

export function ownerOf(rowTenant: string | null | undefined): string | null {
  const t = (rowTenant ?? '').trim();
  return t || defaultTenant();
}

export function isUnrestricted(identity: RequestIdentity | null | undefined): boolean {
  if (!identity) return true;
  return !identity.authenticated || identity.role === 'platform-admin';
}

/** May this identity change a row owned by `rowTenant`? */
export function canWrite(identity: RequestIdentity | null | undefined, rowTenant: string | null | undefined): boolean {
  if (isUnrestricted(identity)) return true;
  // Logged in without an org (misconfigured group link): read-only, never "owns" legacy rows.
  if (!identity!.tenant) return false;
  return ownerOf(rowTenant) === identity!.tenant;
}

/**
 * May this identity see a row's private details: where it is stored (box/shelf/site) and who handled
 * it (event actors, markers, reviewers)? Everything else stays shared (§2a). Same rule as writes for
 * now, kept separate because org groups / shared warehouses will likely widen reads first.
 */
export function canSeePrivate(identity: RequestIdentity | null | undefined, rowTenant: string | null | undefined): boolean {
  return canWrite(identity, rowTenant);
}

/** May this identity create new owned rows (they would be stamped with its tenant)? */
export function canCreate(identity: RequestIdentity | null | undefined): boolean {
  return isUnrestricted(identity) || Boolean(identity?.tenant);
}

// Role tiers (docs/PLANNING_TENANCY.md §7, 2026-10-27): operator (`normal`) < tenant-admin (`super`)
// < super-admin (`platform-admin`), cumulative. Unrestricted requests (no login / platform admin)
// already pass every check; these name the higher tiers for the capabilities they add. Ownership
// (own-org vs foreign) is orthogonal — these gate *what kind* of action a role may take at all.

/** Tenant admin or above (`super` / `platform-admin`). */
export function isTenantAdmin(identity: RequestIdentity | null | undefined): boolean {
  return identity?.role === 'super' || identity?.role === 'platform-admin';
}

/** Super admin only (`platform-admin`) — manages orgs and taxonomy. */
export function isSuperAdmin(identity: RequestIdentity | null | undefined): boolean {
  return identity?.role === 'platform-admin';
}

/** Creating warehouse structure (shelves/sites) is a tenant-admin capability, not an operator one. */
export function canManageShelves(identity: RequestIdentity | null | undefined): boolean {
  return isUnrestricted(identity) || isTenantAdmin(identity);
}

/**
 * May this identity edit a catalogue reference owned by `refOwner`? Operators edit only their own
 * org's references (as before); tenant admins curate **any** reference in the shared catalogue
 * (§7 M2). Reads stay global regardless.
 */
export function canEditReference(identity: RequestIdentity | null | undefined, refOwner: string | null | undefined): boolean {
  if (isUnrestricted(identity) || isTenantAdmin(identity)) return true;
  return canWrite(identity, refOwner); // operator: own org only
}

/** Deleting a catalogue reference is a tenant-admin capability (§7 Q1) — any reference; operators never delete references. */
export function canDeleteReference(identity: RequestIdentity | null | undefined): boolean {
  return isUnrestricted(identity) || isTenantAdmin(identity);
}

// --- Request context -------------------------------------------------------------------------
// The DB layer needs the requester to guard its shared upserts (catalogue entries are written from
// a dozen paths). AsyncLocalStorage carries it from the dispatcher without threading an identity
// parameter through every persistence function; no context = background job = unrestricted.
const requestContext = new AsyncLocalStorage<{ identity: RequestIdentity }>();

export function runWithIdentity<T>(identity: RequestIdentity, fn: () => T): T {
  return requestContext.run({ identity }, fn);
}

export function currentIdentity(): RequestIdentity | null {
  return requestContext.getStore()?.identity ?? null;
}

/**
 * SQL parameters for an owner check: [unrestricted, requesterTenant, defaultTenant].
 * Used as `... WHERE $u OR COALESCE(<table>.<owner col>, $d) = $t` — in the guarded upserts and in
 * the read filters (foreign boxes, event feeds). A null requester tenant never matches (fail closed).
 */
export function writeScopeParams(): [boolean, string | null, string | null] {
  const identity = currentIdentity();
  return [isUnrestricted(identity), identity?.tenant ?? null, defaultTenant()];
}

/**
 * Like `writeScopeParams`, but for the reference-upsert safety net: tenant admins bypass the owner
 * check too, because they may curate any reference (§7 M2). Operators still match only own-org refs.
 */
export function refWriteScopeParams(): [boolean, string | null, string | null] {
  const identity = currentIdentity();
  return [isUnrestricted(identity) || isTenantAdmin(identity), identity?.tenant ?? null, defaultTenant()];
}
