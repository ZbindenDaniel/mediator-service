import type { ServerResponse } from 'http';

// Two-org verification matrix (docs/PLANNING_TENANCY.md Phase 3 "Next"). The policy (ownership.ts) and
// each applied layer (redaction.ts, write-guard.ts) have focused unit tests; this file is the
// cross-product that proves they compose for a *real request* — one requester identity seeing a mixed
// world of rows owned by org A, org B and legacy (unowned) — so a regression in any single layer that
// only shows up in combination is caught. Postgres is not involved: the DB owner lookups the write
// guards use are mocked to a fixed world, exactly as the handlers would see them.

// A small fixed world, keyed by id, shared by the read rows and the mocked owner lookups.
const OWNER: Record<string, string | null> = {
  'a-item': 'a', 'b-item': 'b', 'legacy-item': null,
  'a-box': 'a', 'b-box': 'b',
  'a-ref': 'a', 'b-ref': 'b'
};

jest.mock('../db', () => ({
  getRowOwner: jest.fn(async (_kind: string, id: string) => (id in OWNER ? OWNER[id] : undefined)),
  getItemOwners: jest.fn(async (ids: string[]) => new Map(ids.filter((i) => i in OWNER).map((i) => [i, OWNER[i]]))),
  getRefOwners: jest.fn(async (ids: string[]) => new Map(ids.filter((i) => i in OWNER).map((i) => [i, OWNER[i]])))
}));

import { runWithIdentity } from '../lib/ownership';
import { redactItemRows, visibleBoxRows, redactPeople, tenantDisplayName } from '../lib/redaction';
import { guardWrite, guardWriteMany, guardCreate } from '../utils/write-guard';
import { resetTenantGroupMapCache } from '../lib/identity';
import type { RequestIdentity } from '../lib/identity';

const id = (over: Partial<RequestIdentity>): RequestIdentity => ({
  authenticated: true, username: 'u', groups: [], tenant: null, role: null, ...over
});
const orgA = id({ username: 'alice', tenant: 'a', role: 'normal' });
const orgB = id({ username: 'bob', tenant: 'b', role: 'normal' });
const admin = id({ username: 'root', tenant: 'a', role: 'platform-admin' });
const anon = id({ authenticated: false, username: null });
const noOrg = id({ username: 'nemo', tenant: null, role: null });

// defaultTenant = 'a', so legacy (unowned) rows belong to org A — the single-org deployment that joins
// tenancy by naming its default org, with no backfill.
function withWorld(fn: () => void | Promise<void>): Promise<void> {
  const prev = process.env.TENANT_GROUP_MAP;
  process.env.TENANT_GROUP_MAP = JSON.stringify({
    platformAdminGroup: 'mediator-admin',
    tenants: [{ id: 'a', label: 'Org A', group: 'g-a' }, { id: 'b', label: 'Org B', group: 'g-b' }],
    defaultTenant: 'a'
  });
  resetTenantGroupMapCache();
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.TENANT_GROUP_MAP; else process.env.TENANT_GROUP_MAP = prev;
    resetTenantGroupMapCache();
  });
}

const itemRows = () => [
  { ItemUUID: 'a-item', TenantId: 'a', BoxID: 'a-box', Location: 'a-box', ShelfLabel: 'Shelf A' },
  { ItemUUID: 'b-item', TenantId: 'b', BoxID: 'b-box', Location: 'b-box', ShelfLabel: 'Shelf B' },
  { ItemUUID: 'legacy-item', TenantId: null, BoxID: 'old-box', Location: 'old-box', ShelfLabel: 'Shelf X' }
];
const boxRows = () => [{ BoxID: 'a-box', TenantId: 'a' }, { BoxID: 'b-box', TenantId: 'b' }];
const resp = () => {
  const r = { status: 0, body: '', writeHead(s: number) { r.status = s; }, end(b: string) { r.body = b; } };
  return r as typeof r & ServerResponse;
};

/** Everything one requester experiences against the fixed world, in a single structured snapshot. */
async function perspective(who: RequestIdentity) {
  return runWithIdentity(who, async () => {
    const items = redactItemRows(itemRows());
    const boxes = visibleBoxRows(boxRows()).map((b) => b.BoxID);
    const foreignMark = redactPeople({ Username: 'bob', note: 'x' }, 'b', ['Username']);
    const ownMark = redactPeople({ Username: 'alice', note: 'y' }, 'a', ['Username']);
    const ctx = { identity: who };
    return {
      // per item: is the storage location still visible (not redacted to the owner name)?
      locationVisible: Object.fromEntries(items.map((r) => [r.ItemUUID, r.BoxID !== null && !r.LocationRedacted])),
      // per item: the Location field as the requester sees it (owner name once redacted)
      label: Object.fromEntries(items.map((r) => [r.ItemUUID, r.Location])),
      visibleBoxes: boxes,
      foreignActor: foreignMark.Username,
      ownActor: ownMark.Username,
      writeOwn: await guardWrite(ctx, resp(), 'item', 'a-item'),
      writeForeign: await guardWrite(ctx, resp(), 'item', 'b-item'),
      writeLegacy: await guardWrite(ctx, resp(), 'item', 'legacy-item'),
      writeMany: await guardWriteMany(ctx, resp(), 'item', ['a-item', 'b-item']),
      create: guardCreate(ctx, resp())
    };
  });
}

describe('tenancy two-org matrix', () => {
  it('org A: own + legacy are fully visible/writable; org B is read-only and location-redacted', async () => {
    await withWorld(async () => {
      const p = await perspective(orgA);
      expect(p.locationVisible).toEqual({ 'a-item': true, 'b-item': false, 'legacy-item': true });
      expect(p.label['b-item']).toBe('Org B');         // foreign location shows the owner's name
      expect(p.label['a-item']).toBe('a-box');         // own location unchanged
      expect(p.visibleBoxes).toEqual(['a-box']);       // org B's box is invisible, not just redacted
      expect(p.foreignActor).toBeNull();               // who handled org B's row is hidden
      expect(p.ownActor).toBe('alice');
      expect([p.writeOwn, p.writeLegacy, p.create]).toEqual([true, true, true]);
      expect([p.writeForeign, p.writeMany]).toEqual([false, false]); // mixed bulk is all-or-nothing
    });
  });

  it('org B: mirror image — B owns b-item, A (incl. legacy) is read-only and redacted', async () => {
    await withWorld(async () => {
      const p = await perspective(orgB);
      expect(p.locationVisible).toEqual({ 'a-item': false, 'b-item': true, 'legacy-item': false });
      expect(p.label['a-item']).toBe('Org A');         // A's location redacted to A's name
      expect(p.label['legacy-item']).toBe('Org A');    // legacy belongs to default org A
      expect(p.label['b-item']).toBe('b-box');         // B sees its own location
      expect(p.visibleBoxes).toEqual(['b-box']);
      expect(p.writeForeign).toBe(true);               // b-item is B's own
      expect(p.writeOwn).toBe(false);                  // a-item is foreign to B
      expect(p.writeLegacy).toBe(false);               // legacy belongs to default org A
      expect(p.create).toBe(true);
    });
  });

  it('platform admin and the live system (no login) see and write everything', async () => {
    await withWorld(async () => {
      for (const who of [admin, anon]) {
        const p = await perspective(who);
        expect(p.locationVisible).toEqual({ 'a-item': true, 'b-item': true, 'legacy-item': true });
        expect(p.visibleBoxes).toEqual(['a-box', 'b-box']);
        expect(p.foreignActor).toBe('bob');            // nothing redacted
        expect([p.writeOwn, p.writeForeign, p.writeLegacy, p.writeMany, p.create]).toEqual([true, true, true, true, true]);
      }
    });
  });

  it('logged in without an org: everything private is hidden and nothing is writable (fail closed)', async () => {
    await withWorld(async () => {
      const p = await perspective(noOrg);
      expect(p.locationVisible).toEqual({ 'a-item': false, 'b-item': false, 'legacy-item': false });
      expect(p.visibleBoxes).toEqual([]);
      expect(p.foreignActor).toBeNull();
      expect([p.writeOwn, p.writeForeign, p.writeLegacy, p.writeMany, p.create]).toEqual([false, false, false, false, false]);
    });
  });

  // DL2 (cross-org aggregate quantity) is satisfied by the 2a shared-reads pivot, not a separate
  // feature: redaction hides another org's *location* but never drops the instance, so any quantity
  // grouped over the item list still sums across every org. This guards against a future tenant
  // WHERE-filter on list reads silently making totals org-local again.
  it('DL2 invariant: no requester ever loses instances from the shared catalogue', async () => {
    await withWorld(async () => {
      for (const who of [orgA, orgB, admin, anon, noOrg]) {
        const rows = await runWithIdentity(who, () => redactItemRows(itemRows()));
        expect(rows.map((r) => r.ItemUUID).sort()).toEqual(['a-item', 'b-item', 'legacy-item']);
      }
    });
  });

  it('display names resolve from the group map, with neutral fallbacks', async () => {
    await withWorld(() => {
      expect(tenantDisplayName('a')).toBe('Org A');
      expect(tenantDisplayName('zzz')).toBe('zzz');    // unknown id → the id itself
      expect(tenantDisplayName(null)).toBe('Andere Organisation');
    });
  });
});
