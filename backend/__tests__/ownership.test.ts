import { canCreate, canManageShelves, canWrite, currentIdentity, isSuperAdmin, isTenantAdmin, ownerOf, runWithIdentity, writeScopeParams } from '../lib/ownership';
import { resetTenantGroupMapCache } from '../lib/identity';
import type { RequestIdentity } from '../lib/identity';

const id = (over: Partial<RequestIdentity>): RequestIdentity => ({
  authenticated: true, username: 'u', groups: [], tenant: null, role: null, ...over
});
const anon = id({ authenticated: false, username: null });
const orgA = id({ tenant: 'a', role: 'normal' });
const orgB = id({ tenant: 'b', role: 'normal' });
const admin = id({ tenant: 'a', role: 'platform-admin' });
const noOrg = id({ tenant: null, role: null });

function withDefaultTenant(def: string | null, fn: () => void) {
  const prev = process.env.TENANT_GROUP_MAP;
  process.env.TENANT_GROUP_MAP = JSON.stringify({ platformAdminGroup: 'mediator-admin', tenants: [], defaultTenant: def });
  resetTenantGroupMapCache();
  try { fn(); } finally {
    if (prev === undefined) delete process.env.TENANT_GROUP_MAP; else process.env.TENANT_GROUP_MAP = prev;
    resetTenantGroupMapCache();
  }
}

describe('tenancy write rules', () => {
  it('live system (no login): everything stays writable, as before tenancy', () => {
    withDefaultTenant(null, () => {
      expect(canWrite(anon, null)).toBe(true);
      expect(canWrite(anon, 'a')).toBe(true);
      expect(canCreate(anon)).toBe(true);
    });
  });

  it('orgs may change only their own rows; platform admins everything', () => {
    withDefaultTenant(null, () => {
      expect(canWrite(orgA, 'a')).toBe(true);
      expect(canWrite(orgB, 'a')).toBe(false);
      expect(canWrite(admin, 'b')).toBe(true);
    });
  });

  it('rows without owner belong to the default org (no backfill needed)', () => {
    withDefaultTenant('a', () => {
      expect(ownerOf(null)).toBe('a');
      expect(canWrite(orgA, null)).toBe(true);
      expect(canWrite(orgB, null)).toBe(false);
    });
    withDefaultTenant(null, () => {
      // No default org: unowned legacy rows are writable only without login / by admins.
      expect(canWrite(orgA, null)).toBe(false);
    });
  });

  it('a logged-in user without org can neither write nor create (fail closed)', () => {
    withDefaultTenant('a', () => {
      expect(canWrite(noOrg, null)).toBe(false);
      expect(canCreate(noOrg)).toBe(false);
      expect(canCreate(orgA)).toBe(true);
    });
  });
});

describe('role tiers (operator < tenant-admin < super-admin)', () => {
  const tenantAdmin = id({ tenant: 'a', role: 'super' });

  it('names the tenant-admin and super-admin tiers', () => {
    expect(isTenantAdmin(tenantAdmin)).toBe(true);   // super
    expect(isTenantAdmin(admin)).toBe(true);          // platform-admin is also a tenant admin
    expect(isTenantAdmin(orgA)).toBe(false);          // operator
    expect(isSuperAdmin(admin)).toBe(true);
    expect(isSuperAdmin(tenantAdmin)).toBe(false);
  });

  it('shelf creation is a tenant-admin capability; operators and no-org cannot', () => {
    expect(canManageShelves(tenantAdmin)).toBe(true);
    expect(canManageShelves(admin)).toBe(true);
    expect(canManageShelves(anon)).toBe(true);        // live system (no login) unchanged
    expect(canManageShelves(orgA)).toBe(false);       // operator
    expect(canManageShelves(noOrg)).toBe(false);
  });
});

describe('request context for the DB safety net', () => {
  it('is unrestricted outside a request (background jobs)', () => {
    withDefaultTenant('a', () => {
      expect(currentIdentity()).toBeNull();
      expect(writeScopeParams()).toEqual([true, null, 'a']);
    });
  });

  it('carries the requester through async work inside a request', async () => {
    let seen: unknown;
    await runWithIdentity(orgB, async () => {
      await new Promise((r) => setTimeout(r, 1));
      seen = writeScopeParams();
    });
    expect(seen).toEqual([false, 'b', null]);
  });
});
