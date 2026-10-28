import type { IncomingMessage } from 'http';
import { ADMIN_SECRET, AUTH_REQUIRED, INTAKE_TOKEN } from '../config';

// Defence in depth for public deployments (AUTH_REQUIRED=true): the proxy's forward-auth is the
// real login, but if anything ever reaches the backend directly (exposed port, misrouted proxy
// rule), data routes must not answer without an identity. Static shell paths stay open because
// they carry no data and the container healthcheck hits GET /.
//
// Gated by data-bearing prefix rather than by a public allow-list, because the SPA fallback serves
// index.html for any unknown non-/api GET. A new data route outside these prefixes must be added here.
const PROTECTED_PREFIXES = ['/api/', '/media/', '/prints/', '/external-docs/'];

export interface IdentityGateOptions {
  required: boolean;
  adminSecret: string;
  intakeToken: string;
}

const DEFAULT_OPTIONS: IdentityGateOptions = {
  required: AUTH_REQUIRED,
  adminSecret: ADMIN_SECRET,
  intakeToken: INTAKE_TOKEN
};

function header(req: Pick<IncomingMessage, 'headers'>, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v || '').trim();
}

/** True when the request may proceed; false means answer 401. */
export function isRequestAllowed(
  req: Pick<IncomingMessage, 'headers'>,
  pathname: string,
  opts: IdentityGateOptions = DEFAULT_OPTIONS
): boolean {
  if (!opts.required) return true;
  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (header(req, 'x-authentik-username')) return true;
  // Machine/break-glass credentials for the two routes the proxy deliberately leaves without
  // forward-auth. An unset secret never matches, so AUTH_REQUIRED fails closed on them.
  if (pathname.startsWith('/api/admin/') && opts.adminSecret
    && header(req, 'authorization') === `Bearer ${opts.adminSecret}`) return true;
  if (pathname.startsWith('/api/intake/') && opts.intakeToken
    && header(req, 'x-intake-token') === opts.intakeToken) return true;
  return false;
}
