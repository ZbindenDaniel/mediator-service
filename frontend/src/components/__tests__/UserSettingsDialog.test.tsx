import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UserSettingsDialog from '../UserSettingsDialog';
import { IdentityContext } from '../../context/IdentityContext';
import type { IdentityContextValue } from '../../context/IdentityContext';
import { getUser, setLoginUser } from '../../lib/user';

const loggedIn: IdentityContextValue = {
  authenticated: true,
  username: 'alice',
  groups: ['tenant-revamp'],
  tenant: 'revamp',
  tenantLabel: 'revamp-it',
  role: 'normal',
  isPlatformAdmin: false
};

function render(identity?: IdentityContextValue) {
  const dialog = (
    <UserSettingsDialog currentUser="alice" currentSimpleMode={false} onSave={() => {}} onCancel={() => {}} />
  );
  return renderToStaticMarkup(
    identity ? <IdentityContext.Provider value={identity}>{dialog}</IdentityContext.Provider> : dialog
  );
}

describe('UserSettingsDialog', () => {
  it('shows the login identity read-only with a logout link when logged in', () => {
    const markup = render(loggedIn);
    expect(markup).toContain('revamp-it');
    expect(markup).toContain('>Benutzer<');
    expect(markup).toContain('href="/outpost.goauthentik.io/sign_out"');
    expect(markup).not.toContain('type="text"');
  });

  it('keeps the editable username field without a login', () => {
    const markup = render();
    expect(markup).toContain('type="text"');
    expect(markup).not.toContain('sign_out');
  });
});

describe('getUser with a login', () => {
  afterEach(() => setLoginUser(''));

  it('returns the login name instead of the free-text one', () => {
    setLoginUser('alice');
    expect(getUser()).toBe('alice');
  });
});
