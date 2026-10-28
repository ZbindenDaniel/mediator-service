import { isRequestAllowed } from '../require-identity';

const ON = { required: true, adminSecret: 'adm', intakeToken: 'tok' };
const req = (headers: Record<string, string> = {}) => ({ headers });

describe('isRequestAllowed', () => {
  it('allows everything when AUTH_REQUIRED is off', () => {
    expect(isRequestAllowed(req(), '/api/items', { ...ON, required: false })).toBe(true);
  });

  it('keeps the static shell open (healthcheck, bundle, SPA deep links)', () => {
    for (const p of ['/', '/bundle.js', '/bundle.css', '/assets/logo.svg', '/print/29x90.html', '/items/abc']) {
      expect(isRequestAllowed(req(), p, ON)).toBe(true);
    }
  });

  it('rejects data routes without identity', () => {
    for (const p of ['/api/items', '/api/whoami', '/media/x.jpg', '/prints/a.pdf', '/external-docs/a/b']) {
      expect(isRequestAllowed(req(), p, ON)).toBe(false);
    }
  });

  it('allows data routes with a forward-auth username', () => {
    expect(isRequestAllowed(req({ 'x-authentik-username': 'alice' }), '/api/items', ON)).toBe(true);
    expect(isRequestAllowed(req({ 'x-authentik-username': '  ' }), '/api/items', ON)).toBe(false);
  });

  it('accepts the admin bearer only on /api/admin/', () => {
    const bearer = req({ authorization: 'Bearer adm' });
    expect(isRequestAllowed(bearer, '/api/admin/config', ON)).toBe(true);
    expect(isRequestAllowed(bearer, '/api/items', ON)).toBe(false);
    expect(isRequestAllowed(req({ authorization: 'Bearer nope' }), '/api/admin/config', ON)).toBe(false);
  });

  it('accepts the intake token only on /api/intake/', () => {
    const tok = req({ 'x-intake-token': 'tok' });
    expect(isRequestAllowed(tok, '/api/intake/start', ON)).toBe(true);
    expect(isRequestAllowed(tok, '/api/items', ON)).toBe(false);
  });

  it('fails closed when the machine secrets are unset', () => {
    const noSecrets = { required: true, adminSecret: '', intakeToken: '' };
    expect(isRequestAllowed(req({ authorization: 'Bearer ' }), '/api/admin/config', noSecrets)).toBe(false);
    expect(isRequestAllowed(req({ 'x-intake-token': '' }), '/api/intake/start', noSecrets)).toBe(false);
  });
});
