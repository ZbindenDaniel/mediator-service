import type { ServerResponse } from 'http';
import type { RequestIdentity } from '../lib/identity';
import { canCreate, canWrite, isUnrestricted } from '../lib/ownership';
import { getItemOwners, getRefOwners, getRowOwner } from '../db';

// Handler-level tenancy checks (Phase 3): reject writes to another org's rows up front with a clear
// 403. The DB upserts carry the same rule as a safety net; this layer exists for the message and
// for handlers that run their own SQL. Rules live in lib/ownership.ts.

type Ctx = { identity?: RequestIdentity } | null | undefined;

const FOREIGN = 'Gehört einer anderen Organisation und kann nur gelesen werden.';
const NO_ORG = 'Deinem Konto ist keine Organisation zugeordnet; Änderungen sind nicht möglich.';

function forbid(res: ServerResponse, error: string, extra: Record<string, unknown> = {}): false {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error, ...extra }));
  return false;
}

/** True if the write may proceed. A missing row passes (the handler answers 404 itself). */
export async function guardWrite(ctx: Ctx, res: ServerResponse, kind: 'item' | 'box' | 'ref', id: string | null | undefined): Promise<boolean> {
  // Unrestricted requests (live system without login, platform admins) skip the owner lookup,
  // so the live system pays no extra query per write.
  if (!id || isUnrestricted(ctx?.identity)) return true;
  const owner = await getRowOwner(kind, id);
  if (owner === undefined || canWrite(ctx?.identity, owner)) return true;
  return forbid(res, FOREIGN, { kind, id });
}

/** Batch variant for bulk endpoints: all-or-nothing, lists the rows that belong to other orgs. */
export async function guardWriteMany(ctx: Ctx, res: ServerResponse, kind: 'item' | 'ref', ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0 || isUnrestricted(ctx?.identity)) return true;
  const owners = kind === 'item' ? await getItemOwners(unique) : await getRefOwners(unique);
  const blocked = unique.filter((id) => owners.has(id) && !canWrite(ctx?.identity, owners.get(id)));
  if (blocked.length === 0) return true;
  return forbid(res, FOREIGN, { kind, ids: blocked });
}

/** New rows get the requester's org; a logged-in user without one may not create any. */
export function guardCreate(ctx: Ctx, res: ServerResponse): boolean {
  return canCreate(ctx?.identity) ? true : forbid(res, NO_ORG);
}
