import { validateSiteInput, validateTenantInput } from '../actions/admin-tenants';
import { canUseSite } from '../lib/tenants';
import { resetTenantGroupMapCache, resolveIdentity, setTenantDirectory } from '../lib/identity';

const others = [
  { Id: 'revamp', AuthentikGroup: 'tenant-revamp', AuthentikSuperGroup: 'tenant-revamp-admin' }
];

describe('validateTenantInput', () => {
  it('accepts a minimal org and normalises empty fields to null', () => {
    expect(validateTenantInput({ label: ' Zurich Repair ', contactEmail: '' }, others, 'mediator-admin')).toEqual({
      value: { label: 'Zurich Repair', contactEmail: null, authentikGroup: null, authentikSuperGroup: null }
    });
  });

  it('rejects a group that already belongs to another org (logins must resolve to one org)', () => {
    const r = validateTenantInput({ label: 'X', authentikGroup: 'tenant-revamp-admin' }, others, 'mediator-admin');
    expect(r).toEqual({ error: expect.stringContaining('revamp') });
  });

  it('allows an org to keep its own groups when edited', () => {
    const r = validateTenantInput(
      { label: 'revamp-it', authentikGroup: 'tenant-revamp', authentikSuperGroup: 'tenant-revamp-admin' },
      others, 'mediator-admin', 'revamp'
    );
    expect('value' in r).toBe(true);
  });

  it('rejects the platform admin group, a bad email, and an admin group without a user group', () => {
    expect(validateTenantInput({ label: 'X', authentikGroup: 'mediator-admin' }, others, 'mediator-admin')).toHaveProperty('error');
    expect(validateTenantInput({ label: 'X', contactEmail: 'nope' }, others, 'mediator-admin')).toHaveProperty('error');
    expect(validateTenantInput({ label: 'X', authentikSuperGroup: 'g-admin' }, others, 'mediator-admin')).toHaveProperty('error');
  });
});

describe('validateSiteInput', () => {
  const tenants = new Set(['revamp']);

  it('accepts a site with floors and an existing org', () => {
    expect(validateSiteInput({ label: 'Lager', floors: ['0', '1'], tenantId: 'revamp' }, tenants)).toEqual({
      value: { label: 'Lager', floors: ['0', '1'], tenantId: 'revamp' }
    });
  });

  it('rejects floors containing "-" (it separates shelf id segments), duplicates, none, and unknown orgs', () => {
    expect(validateSiteInput({ label: 'L', floors: ['1-2'] }, tenants)).toHaveProperty('error');
    expect(validateSiteInput({ label: 'L', floors: ['1', '1'] }, tenants)).toHaveProperty('error');
    expect(validateSiteInput({ label: 'L', floors: [] }, tenants)).toHaveProperty('error');
    expect(validateSiteInput({ label: 'L', floors: ['1'], tenantId: 'ghost' }, tenants)).toHaveProperty('error');
  });
});

describe('canUseSite', () => {
  const own = { id: 'B1', tenantId: 'revamp', label: 'x', floors: ['0'] };
  const open = { id: 'B2', tenantId: null, label: 'y', floors: ['0'] };

  it('lets members, platform admins, and anyone on unassigned sites create shelves', () => {
    expect(canUseSite(own, { tenant: 'revamp', role: 'normal' })).toBe(true);
    expect(canUseSite(own, { tenant: 'other', role: 'platform-admin' })).toBe(true);
    expect(canUseSite(open, { tenant: null, role: null })).toBe(true);
  });

  it("blocks another org's members", () => {
    expect(canUseSite(own, { tenant: 'other', role: 'normal' })).toBe(false);
    expect(canUseSite(own, { tenant: null, role: null })).toBe(false);
  });
});

describe('org directory in identity resolution', () => {
  afterEach(() => resetTenantGroupMapCache());

  it('resolves logins through the DB directory instead of the config map', () => {
    setTenantDirectory([{ id: 'zrepair', label: 'Zurich Repair', group: 'tenant-zrepair' }]);
    const id = resolveIdentity({ headers: { 'x-authentik-username': 'anna', 'x-authentik-groups': 'tenant-zrepair' } });
    expect(id.tenant).toBe('zrepair');
    expect(id.role).toBe('normal');
  });
});
