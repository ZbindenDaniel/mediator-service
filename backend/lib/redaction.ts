import type { RequestIdentity } from './identity';
import { configuredTenants } from './identity';
import { canSeePrivate, currentIdentity, isUnrestricted, ownerOf } from './ownership';

// Tenancy read redaction (docs/PLANNING_TENANCY.md §2a, Phase 3b). Reads stay shared — every org sees
// every item, which org holds it and how many — but another org's storage location and the people
// who handled it are hidden. The policy (who sees what) lives in ownership.ts; this file only applies
// it to row shapes. Redaction is a no-op for unrestricted requests (no login / platform admin / jobs).

const UNKNOWN_ORG_LABEL = 'Andere Organisation';

export function tenantDisplayName(tenantId: string | null | undefined): string {
  const id = (tenantId ?? '').trim();
  if (!id) return UNKNOWN_ORG_LABEL;
  return configuredTenants().find((t) => t.id === id)?.label || id;
}

type Row = Record<string, any>;

/**
 * Hides an item's storage location from other orgs. The location shows the owner's name instead
 * (`Location` and `ShelfLabel`, so the UI's location tag renders it without changes); `BoxID` goes,
 * because box ids are scannable and lead to the box. Rows need `TenantId` selected.
 */
export function redactItemRow<T extends Row>(row: T, identity: RequestIdentity | null = currentIdentity()): T {
  if (!row || canSeePrivate(identity, row.TenantId)) return row;
  const ownerName = tenantDisplayName(ownerOf(row.TenantId));
  return { ...row, BoxID: null, Location: ownerName, ShelfLabel: ownerName, LocationRedacted: true };
}

export function redactItemRows<T extends Row>(rows: T[], identity: RequestIdentity | null = currentIdentity()): T[] {
  if (isUnrestricted(identity) || !Array.isArray(rows)) return rows;
  return rows.map((row) => redactItemRow(row, identity));
}

/** Another org's boxes and shelves are invisible (not just redacted). Rows need `TenantId`. */
export function visibleBoxRows<T extends Row>(rows: T[], identity: RequestIdentity | null = currentIdentity()): T[] {
  if (isUnrestricted(identity) || !Array.isArray(rows)) return rows;
  return rows.filter((row) => canSeePrivate(identity, row?.TenantId));
}

export function isBoxVisible(row: Row | null | undefined, identity: RequestIdentity | null = currentIdentity()): boolean {
  return Boolean(row) && canSeePrivate(identity, row!.TenantId);
}

/** Drops person fields (e.g. `Username` on marks, `ReviewedBy` on agentic runs) for another org's row. */
export function redactPeople<T extends Row>(
  row: T,
  rowTenant: string | null | undefined,
  fields: string[],
  identity: RequestIdentity | null = currentIdentity()
): T {
  if (!row || canSeePrivate(identity, rowTenant)) return row;
  const copy: Row = { ...row };
  for (const field of fields) if (field in copy) copy[field] = null;
  return copy as T;
}
