import type { IncomingMessage, ServerResponse } from 'http';

// ADMIN_SECRET is read at module load, so each scenario loads a fresh copy with its own env.
function loadGuard(adminSecret: string): (req: IncomingMessage, res: ServerResponse) => boolean {
  const prev = { secret: process.env.ADMIN_SECRET, map: process.env.TENANT_GROUP_MAP };
  process.env.ADMIN_SECRET = adminSecret;
  delete process.env.TENANT_GROUP_MAP; // default map: platformAdminGroup "mediator-admin"
  let guard!: (req: IncomingMessage, res: ServerResponse) => boolean;
  jest.isolateModules(() => {
    guard = require('../admin-auth').requireAdminAuth;
  });
  process.env.ADMIN_SECRET = prev.secret;
  if (prev.map === undefined) delete process.env.TENANT_GROUP_MAP; else process.env.TENANT_GROUP_MAP = prev.map;
  return guard;
}

function call(guard: ReturnType<typeof loadGuard>, headers: Record<string, string>) {
  const res = { status: 0, writeHead(s: number) { this.status = s; }, end() {} };
  const ok = guard({ headers } as unknown as IncomingMessage, res as unknown as ServerResponse);
  return { ok, status: res.status };
}

const admin = { 'x-authentik-username': 'carol', 'x-authentik-groups': 'mediator-admin' };
const normal = { 'x-authentik-username': 'alice', 'x-authentik-groups': 'tenant-revamp' };

describe('requireAdminAuth', () => {
  describe('with ADMIN_SECRET set', () => {
    const guard = loadGuard('s3cret');

    it('lets a logged-in platform admin in without the secret', () => {
      expect(call(guard, admin)).toEqual({ ok: true, status: 0 });
    });

    it('forbids a logged-in non-admin (403)', () => {
      expect(call(guard, normal)).toEqual({ ok: false, status: 403 });
    });

    it('accepts the break-glass bearer', () => {
      expect(call(guard, { authorization: 'Bearer s3cret' }).ok).toBe(true);
    });

    it('rejects a wrong bearer without login (401)', () => {
      expect(call(guard, { authorization: 'Bearer nope' })).toEqual({ ok: false, status: 401 });
    });
  });

  describe('without ADMIN_SECRET (local dev)', () => {
    const guard = loadGuard('');

    it('stays open when nobody is logged in', () => {
      expect(call(guard, {}).ok).toBe(true);
    });

    it('still forbids a logged-in non-admin', () => {
      expect(call(guard, normal)).toEqual({ ok: false, status: 403 });
    });

    it('lets a platform admin in', () => {
      expect(call(guard, admin).ok).toBe(true);
    });
  });
});

// Two-tier split (§7 M1): tenant admins reach the panel/operational endpoints; only super admins
// reach the deployment-wide ones. Needs a map that defines a tenant with a superGroup.
function loadTierGuards(adminSecret: string) {
  const prev = { secret: process.env.ADMIN_SECRET, map: process.env.TENANT_GROUP_MAP };
  process.env.ADMIN_SECRET = adminSecret;
  process.env.TENANT_GROUP_MAP = JSON.stringify({
    platformAdminGroup: 'mediator-admin',
    tenants: [{ id: 'revamp', group: 'tenant-revamp', superGroup: 'tenant-revamp-admin' }],
    defaultTenant: null
  });
  let mod!: { requireAdminAuth: any; requireSuperAdminAuth: any };
  jest.isolateModules(() => { mod = require('../admin-auth'); });
  // Restore ADMIN_SECRET now (captured at module load), but leave the map set: the isolated identity
  // module reads it lazily at call time, i.e. during the it() blocks that run after this helper.
  process.env.ADMIN_SECRET = prev.secret;
  return mod;
}

describe('admin tiers — requireAdminAuth vs requireSuperAdminAuth', () => {
  const { requireAdminAuth: adminGuard, requireSuperAdminAuth: superGuard } = loadTierGuards('s3cret');
  const platformAdmin = { 'x-authentik-username': 'carol', 'x-authentik-groups': 'mediator-admin' };
  const tenantAdmin = { 'x-authentik-username': 'bob', 'x-authentik-groups': 'tenant-revamp|tenant-revamp-admin' };
  const operator = { 'x-authentik-username': 'alice', 'x-authentik-groups': 'tenant-revamp' };

  it('platform admin passes both tiers', () => {
    expect(call(adminGuard, platformAdmin).ok).toBe(true);
    expect(call(superGuard, platformAdmin).ok).toBe(true);
  });

  it('tenant admin reaches the panel but not the deployment-wide endpoints', () => {
    expect(call(adminGuard, tenantAdmin).ok).toBe(true);
    expect(call(superGuard, tenantAdmin)).toEqual({ ok: false, status: 403 });
  });

  it('operator is forbidden from both', () => {
    expect(call(adminGuard, operator)).toEqual({ ok: false, status: 403 });
    expect(call(superGuard, operator)).toEqual({ ok: false, status: 403 });
  });

  it('the break-glass bearer passes both tiers', () => {
    expect(call(adminGuard, { authorization: 'Bearer s3cret' }).ok).toBe(true);
    expect(call(superGuard, { authorization: 'Bearer s3cret' }).ok).toBe(true);
  });
});
