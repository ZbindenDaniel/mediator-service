import { resolveActor } from '../actor';

describe('resolveActor', () => {
  it('prefers the authenticated username when present', () => {
    expect(resolveActor({ identity: { authenticated: true, username: 'alice', groups: [], tenant: 't', role: 'normal' } }, 'typed-name')).toBe('alice');
  });
  it('falls back to the request actor when unauthenticated (behaviour-neutral pre-forward-auth)', () => {
    expect(resolveActor({ identity: { authenticated: false, username: null, groups: [], tenant: null, role: null } }, 'typed-name')).toBe('typed-name');
    expect(resolveActor(undefined, 'typed-name')).toBe('typed-name');
    expect(resolveActor(null, '  spaced  ')).toBe('spaced');
  });
  it('returns empty string when neither is available', () => {
    expect(resolveActor(undefined, '')).toBe('');
    expect(resolveActor({}, null)).toBe('');
  });
});
