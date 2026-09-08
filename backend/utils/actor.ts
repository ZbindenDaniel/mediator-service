import type { RequestIdentity } from '../lib/identity';

// Prefer the forward-auth authenticated username over a request-supplied "actor" so audit records
// the real user (docs/PLANNING_TENANCY.md Phase 1). Falls back to the request actor when
// unauthenticated (dev, or before the proxy is wired), so this is behaviour-neutral until Phase 1b.
export function resolveActor(
  ctx: { identity?: RequestIdentity } | undefined | null,
  requestActor?: string | null
): string {
  const authed = ctx?.identity?.username?.trim();
  if (authed) return authed;
  return (requestActor ?? '').trim();
}
