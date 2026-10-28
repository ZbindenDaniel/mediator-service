import React, { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { setLoginUser } from '../lib/user';

// Who is logged in, fetched once at boot from GET /api/whoami (Authentik forward-auth identity).
// When authenticated, the login name replaces the free-text username everywhere (getUser()), and
// admin UI is shown by role instead of by the ADMIN_SECRET password. Without a login (Basic Auth
// deployments, local dev) everything behaves as before.

export type Role = 'platform-admin' | 'super' | 'normal';

export interface Identity {
  authenticated: boolean;
  username: string | null;
  groups: string[];
  tenant: string | null;
  tenantLabel: string | null;
  role: Role | null;
}

export interface IdentityContextValue extends Identity {
  isPlatformAdmin: boolean;
}

const ANONYMOUS: IdentityContextValue = {
  authenticated: false,
  username: null,
  groups: [],
  tenant: null,
  tenantLabel: null,
  role: null,
  isPlatformAdmin: false
};

// Default = anonymous so components rendered without a provider (isolated tests) keep the
// pre-login behaviour.
// Exported for tests that need a specific identity without fetching /api/whoami.
export const IdentityContext = createContext<IdentityContextValue>(ANONYMOUS);

export function IdentityProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<IdentityContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/whoami')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { identity?: Partial<Identity>; tenantLabel?: string | null }) => {
        if (cancelled) return;
        const id = data.identity ?? {};
        const authenticated = id.authenticated === true && !!id.username;
        const next: IdentityContextValue = {
          authenticated,
          username: authenticated ? id.username ?? null : null,
          groups: Array.isArray(id.groups) ? id.groups : [],
          tenant: id.tenant ?? null,
          tenantLabel: data.tenantLabel ?? null,
          role: id.role ?? null,
          isPlatformAdmin: authenticated && id.role === 'platform-admin'
        };
        setLoginUser(next.username ?? '');
        setValue(next);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Identity] Failed to load /api/whoami', err);
        setValue(ANONYMOUS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hold rendering until known: the app reads getUser() on mount (start redirect, marks), and must
  // see the login name rather than briefly falling back to the free-text one.
  if (!value) return null;
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  return useContext(IdentityContext);
}
