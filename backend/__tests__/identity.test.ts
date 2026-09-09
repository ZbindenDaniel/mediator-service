import { resolveIdentity, loadTenantGroupMap, resetTenantGroupMapCache, configuredTenants, type TenantGroupMap } from '../lib/identity';

const MAP: TenantGroupMap = {
  platformAdminGroup: 'mediator-admin',
  tenants: [
    { id: 'revamp', label: 'revamp-it', group: 'tenant-revamp', superGroup: 'tenant-revamp-admin' },
    { id: 'acme', label: 'ACME', group: 'tenant-acme' }
  ],
  defaultTenant: 'revamp'
};

const req = (headers: Record<string, unknown>) => ({ headers });

describe('resolveIdentity', () => {
  it('treats a request with no auth headers as unauthenticated (default tenant only)', () => {
    const id = resolveIdentity(req({}), MAP);
    expect(id.authenticated).toBe(false);
    expect(id.username).toBeNull();
    expect(id.role).toBeNull();
    expect(id.tenant).toBe('revamp'); // default tenant surfaced, but not authenticated
  });

  it('resolves a normal user in a tenant group', () => {
    const id = resolveIdentity(req({ 'x-authentik-username': 'bob', 'x-authentik-groups': 'tenant-acme' }), MAP);
    expect(id).toMatchObject({ authenticated: true, username: 'bob', tenant: 'acme', role: 'normal' });
  });

  it('resolves a tenant admin (super) via the tenant superGroup', () => {
    const id = resolveIdentity(req({ 'x-authentik-username': 'carol', 'x-authentik-groups': 'tenant-revamp|tenant-revamp-admin' }), MAP);
    expect(id).toMatchObject({ tenant: 'revamp', role: 'super' });
  });

  it('resolves a platform admin regardless of tenant groups', () => {
    const id = resolveIdentity(req({ 'x-authentik-username': 'root', 'x-authentik-groups': 'mediator-admin|tenant-acme' }), MAP);
    expect(id.role).toBe('platform-admin');
  });

  it('parses groups separated by | or ,', () => {
    const pipe = resolveIdentity(req({ 'x-authentik-username': 'u', 'x-authentik-groups': 'a|tenant-acme|b' }), MAP);
    const comma = resolveIdentity(req({ 'x-authentik-username': 'u', 'x-authentik-groups': 'a, tenant-acme, b' }), MAP);
    expect(pipe.tenant).toBe('acme');
    expect(comma.tenant).toBe('acme');
  });

  it('falls back to the default tenant (role normal) when the user is in no known tenant group', () => {
    const id = resolveIdentity(req({ 'x-authentik-username': 'stray', 'x-authentik-groups': 'some-other-group' }), MAP);
    expect(id).toMatchObject({ authenticated: true, tenant: 'revamp', role: 'normal' });
  });

  it('has no tenant/role when authenticated but no group matches and no default tenant', () => {
    const id = resolveIdentity(req({ 'x-authentik-username': 'x', 'x-authentik-groups': 'nope' }), { ...MAP, defaultTenant: null });
    expect(id).toMatchObject({ authenticated: true, tenant: null, role: null });
  });
});

describe('loadTenantGroupMap (env)', () => {
  afterEach(() => { delete process.env.TENANT_GROUP_MAP; resetTenantGroupMapCache(); });

  it('defaults when unset', () => {
    resetTenantGroupMapCache();
    const m = loadTenantGroupMap();
    expect(m.platformAdminGroup).toBe('mediator-admin');
    expect(m.tenants).toEqual([]);
    expect(m.defaultTenant).toBeNull();
  });

  it('parses an inline TENANT_GROUP_MAP JSON', () => {
    process.env.TENANT_GROUP_MAP = JSON.stringify({ platformAdminGroup: 'admins', tenants: [{ id: 't1', group: 'g1' }], defaultTenant: 't1' });
    resetTenantGroupMapCache();
    const m = loadTenantGroupMap();
    expect(m.platformAdminGroup).toBe('admins');
    expect(m.tenants[0]).toMatchObject({ id: 't1', group: 'g1' });
    expect(m.defaultTenant).toBe('t1');
  });

  it('falls back to defaults on invalid JSON', () => {
    process.env.TENANT_GROUP_MAP = '{not json';
    resetTenantGroupMapCache();
    expect(loadTenantGroupMap().tenants).toEqual([]);
  });
});

describe('configuredTenants', () => {
  const map = (m: Partial<TenantGroupMap>): TenantGroupMap =>
    ({ platformAdminGroup: 'admins', tenants: [], defaultTenant: null, ...m });

  it('lists tenants from the map with labels', () => {
    const result = configuredTenants(map({ tenants: [{ id: 'acme', label: 'ACME Inc', group: 'g-acme' }, { id: 'globex', group: 'g-globex' }] }));
    expect(result).toEqual([{ id: 'acme', label: 'ACME Inc' }, { id: 'globex', label: null }]);
  });

  it('includes the default tenant when not already listed', () => {
    const result = configuredTenants(map({ tenants: [{ id: 'acme', group: 'g-acme' }], defaultTenant: 'legacy' }));
    expect(result).toContainEqual({ id: 'legacy', label: null });
  });

  it('does not duplicate the default tenant when it is already a listed tenant', () => {
    const result = configuredTenants(map({ tenants: [{ id: 'acme', label: 'ACME', group: 'g-acme' }], defaultTenant: 'acme' }));
    expect(result).toEqual([{ id: 'acme', label: 'ACME' }]);
  });

  it('returns an empty list for a single-tenant deployment (no config)', () => {
    expect(configuredTenants(map({}))).toEqual([]);
  });
});
