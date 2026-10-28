jest.mock('../../lib/tenants', () => ({
  getTenantRows: () => [
    { Id: 'orgb', Label: 'Org B', Active: true, CreatedAt: null, ContactEmail: 'lager@orgb.example', AuthentikGroup: 'org-b', AuthentikSuperGroup: null }
  ]
}));

import action from '../org-info';

function call(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 0;
    const res: any = {
      writeHead(s: number) { status = s; },
      end(b: string) { resolve({ status, body: JSON.parse(b) }); }
    };
    void action.handle({ url, method: 'GET' } as any, res, {});
  });
}

describe('org-info', () => {
  it('returns name + contact email only (no Authentik group)', async () => {
    const { status, body } = await call('/api/orgs/orgb');
    expect(status).toBe(200);
    expect(body).toEqual({ id: 'orgb', label: 'Org B', contactEmail: 'lager@orgb.example' });
  });

  it('404 for an unknown org', async () => {
    expect((await call('/api/orgs/nope')).status).toBe(404);
  });
});
