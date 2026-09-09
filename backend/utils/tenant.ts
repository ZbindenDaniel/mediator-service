import type { RequestIdentity } from '../lib/identity';

// Resolve the owning tenant for a create/write from the forward-auth identity on ctx
// (docs/PLANNING_TENANCY.md Phase 2b). Returns null when unauthenticated or when no tenant maps —
// so stamping is behaviour-neutral until forward-auth is live and a tenant/defaultTenant is
// configured. Stamped on create; the upsert SQL preserves an already-set owner (never reassigns).
export function resolveTenant(
  ctx: { identity?: RequestIdentity } | undefined | null
): string | null {
  const tenant = ctx?.identity?.tenant?.trim();
  return tenant ? tenant : null;
}
