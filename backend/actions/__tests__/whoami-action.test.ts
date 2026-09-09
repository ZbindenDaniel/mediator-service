import whoamiAction from '../whoami';
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
    expect(JSON.parse(res.body)).toEqual({ identity });
  });

  it('falls back to an unauthenticated identity when ctx has none', async () => {
    const res = mockRes();
    await whoamiAction.handle({} as any, res as any, {} as any);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      identity: { authenticated: false, username: null, groups: [], tenant: null, role: null }
    });
  });
});
