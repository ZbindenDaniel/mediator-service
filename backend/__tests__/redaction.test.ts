import { redactItemRow, redactItemRows, redactPeople, visibleBoxRows, isBoxVisible, tenantDisplayName } from '../lib/redaction';
import { resetTenantGroupMapCache } from '../lib/identity';
import type { RequestIdentity } from '../lib/identity';

const id = (over: Partial<RequestIdentity>): RequestIdentity => ({
  authenticated: true, username: 'u', groups: [], tenant: null, role: null, ...over
});
const anon = id({ authenticated: false, username: null });
const orgA = id({ tenant: 'a', role: 'normal' });
const admin = id({ tenant: 'a', role: 'platform-admin' });
const noOrg = id({ tenant: null, role: null });

const item = (tenant: string | null) => ({ ItemUUID: 'I-1', BoxID: 'B-1', Location: 'S-X-1', ShelfLabel: 'Regal 1', TenantId: tenant });

beforeEach(() => {
  process.env.TENANT_GROUP_MAP = JSON.stringify({
    tenants: [{ id: 'b', label: 'Org B', group: 'org-b' }],
    defaultTenant: 'revamp'
  });
  resetTenantGroupMapCache();
});
afterAll(() => {
  delete process.env.TENANT_GROUP_MAP;
  resetTenantGroupMapCache();
});

describe('tenancy read redaction', () => {
  it('live system (no login) and platform admins see everything unchanged', () => {
    const rows = [item('b'), item(null)];
    expect(redactItemRows(rows, anon)).toBe(rows);
    expect(redactItemRows(rows, admin)).toBe(rows);
    expect(visibleBoxRows(rows, anon)).toBe(rows);
  });

  it('another org’s item shows the owner name instead of box and shelf', () => {
    const redacted = redactItemRow(item('b'), orgA) as Record<string, unknown>;
    expect(redacted).toMatchObject({ BoxID: null, Location: 'Org B', ShelfLabel: 'Org B', LocationRedacted: true });
    expect(redactItemRow(item('a'), orgA)).toEqual(item('a'));
  });

  it('rows without an owner belong to the default org', () => {
    expect(redactItemRow(item(null), orgA)).toMatchObject({ Location: 'revamp', LocationRedacted: true });
    expect(isBoxVisible({ TenantId: null }, id({ tenant: 'revamp', role: 'normal' }))).toBe(true);
  });

  it('logged in without an org: nothing private is visible (fail closed)', () => {
    expect(redactItemRow(item('a'), noOrg)).toMatchObject({ LocationRedacted: true });
    expect(visibleBoxRows([{ TenantId: 'a' }, { TenantId: null }], noOrg)).toEqual([]);
  });

  it('other orgs’ boxes are filtered out, not redacted', () => {
    expect(visibleBoxRows([{ BoxID: 'A', TenantId: 'a' }, { BoxID: 'B', TenantId: 'b' }], orgA)).toEqual([{ BoxID: 'A', TenantId: 'a' }]);
  });

  it('people fields are cleared on another org’s rows only', () => {
    expect(redactPeople({ ReviewedBy: 'alice' }, 'b', ['ReviewedBy'], orgA)).toEqual({ ReviewedBy: null });
    expect(redactPeople({ ReviewedBy: 'alice' }, 'a', ['ReviewedBy'], orgA)).toEqual({ ReviewedBy: 'alice' });
  });

  it('unknown org ids fall back to the id, missing ones to a neutral label', () => {
    expect(tenantDisplayName('zz')).toBe('zz');
    expect(tenantDisplayName(null)).toBe('Andere Organisation');
  });
});
