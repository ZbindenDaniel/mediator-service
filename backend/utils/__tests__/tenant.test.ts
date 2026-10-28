import { resolveTenant } from '../tenant';

describe('resolveTenant', () => {
  it('returns the tenant from the resolved identity', () => {
    expect(resolveTenant({ identity: { authenticated: true, username: 'a', groups: [], tenant: 'acme', role: 'normal' } })).toBe('acme');
  });

  it('returns null when there is no tenant', () => {
    expect(resolveTenant({ identity: { authenticated: false, username: null, groups: [], tenant: null, role: null } })).toBeNull();
  });

  it('trims whitespace and treats blank as null', () => {
    expect(resolveTenant({ identity: { authenticated: true, username: 'a', groups: [], tenant: '  acme  ', role: 'normal' } })).toBe('acme');
    expect(resolveTenant({ identity: { authenticated: true, username: 'a', groups: [], tenant: '   ', role: 'normal' } })).toBeNull();
  });

  it('is null-safe for missing ctx/identity', () => {
    expect(resolveTenant(undefined)).toBeNull();
    expect(resolveTenant(null)).toBeNull();
    expect(resolveTenant({})).toBeNull();
  });
});
