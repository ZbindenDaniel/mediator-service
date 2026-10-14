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
