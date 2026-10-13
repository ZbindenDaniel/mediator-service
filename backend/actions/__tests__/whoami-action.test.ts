import whoamiAction from '../whoami';
import { resetTenantGroupMapCache } from '../../lib/identity';
import type { RequestIdentity } from '../../lib/identity';

function mockRes() {
  const res: any = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code: number, headers: Record<string, string>) => { res.statusCode = code; res.headers = headers; };
  res.end = (body: string) => { res.body = body; };
  return res;
}

describe('GET /api/whoami action', () => {
  it('matches only the GET route', () => {
    expect(whoamiAction.matches('/api/whoami', 'GET')).toBe(true);
    expect(whoamiAction.matches('/api/whoami', 'POST')).toBe(false);
    expect(whoamiAction.matches('/api/other', 'GET')).toBe(false);
  });

  it('echoes the resolved identity from ctx', async () => {
    const identity: RequestIdentity = {
      authenticated: true, username: 'alice', groups: ['tenant-acme'], tenant: 'acme', role: 'normal'
    };
    const res = mockRes();
    await whoamiAction.handle({} as any, res as any, { identity } as any);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ identity, tenantLabel: null });
  });

  it('falls back to an unauthenticated identity when ctx has none', async () => {
    const res = mockRes();
    await whoamiAction.handle({} as any, res as any, {} as any);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      identity: { authenticated: false, username: null, groups: [], tenant: null, role: null },
      tenantLabel: null
    });
  });

  it('adds the tenant display name from the group map', async () => {
    const prev = process.env.TENANT_GROUP_MAP;
    process.env.TENANT_GROUP_MAP = JSON.stringify({
      platformAdminGroup: 'mediator-admin',
      tenants: [{ id: 'revamp', label: 'revamp-it', group: 'tenant-revamp' }],
      defaultTenant: null
    });
    resetTenantGroupMapCache();
    try {
      const identity: RequestIdentity = {
        authenticated: true, username: 'alice', groups: ['tenant-revamp'], tenant: 'revamp', role: 'normal'
      };
      const res = mockRes();
      await whoamiAction.handle({} as any, res as any, { identity } as any);
      expect(JSON.parse(res.body).tenantLabel).toBe('revamp-it');
    } finally {
      if (prev === undefined) delete process.env.TENANT_GROUP_MAP; else process.env.TENANT_GROUP_MAP = prev;
      resetTenantGroupMapCache();
    }
  });
});
