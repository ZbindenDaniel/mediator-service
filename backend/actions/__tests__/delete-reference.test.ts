import type { IncomingMessage, ServerResponse } from 'http';

// withTransaction just runs the callback here — the action's DB calls are on the mocked ctx.
jest.mock('../../db-client', () => ({ withTransaction: (fn: (c: unknown) => unknown) => fn({}) }));

import deleteReference from '../delete-reference';

// Minimal request stub: the action reads req.url and streams the JSON body off the request.
function makeReq(url: string, body: unknown): IncomingMessage {
  async function* gen() { yield Buffer.from(JSON.stringify(body)); }
  const it = gen();
  return { url, [Symbol.asyncIterator]: () => it } as unknown as IncomingMessage;
}
function makeRes() {
  const res: any = { status: 0, body: '' };
  res.writeHead = (s: number) => { res.status = s; };
  res.end = (b: string) => { res.body = b; };
  return res as { status: number; body: string } & ServerResponse;
}
const identity = (role: string | null, tenant: string | null = 'a') =>
  ({ authenticated: role !== null, username: 'u', groups: [], tenant, role });

function ctx(over: Record<string, any> = {}) {
  return {
    identity: identity('super'),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'A-1' })),
    countInstancesForReference: jest.fn(async () => 0),
    deleteItemReference: jest.fn(async () => undefined),
    logEvent: jest.fn(async () => undefined),
    ...over
  };
}
const body = { actor: 'alice', confirm: true };

describe('delete-reference action', () => {
  it('tenant admin deletes an unused reference', async () => {
    const c = ctx();
    const res = makeRes();
    await deleteReference.handle(makeReq('/api/references/A-1/delete', body), res, c as any);
    expect(res.status).toBe(200);
    expect(c.deleteItemReference).toHaveBeenCalledWith('A-1');
    expect(c.logEvent).toHaveBeenCalledWith(expect.objectContaining({ EntityType: 'Reference', Event: 'Deleted' }));
  });

  it('operators are refused (403) before any lookup', async () => {
    const c = ctx({ identity: identity('normal') });
    const res = makeRes();
    await deleteReference.handle(makeReq('/api/references/A-1/delete', body), res, c as any);
    expect(res.status).toBe(403);
    expect(c.getItemReference).not.toHaveBeenCalled();
    expect(c.deleteItemReference).not.toHaveBeenCalled();
  });

  it('a reference still in use is blocked (409) and never deleted', async () => {
    const c = ctx({ countInstancesForReference: jest.fn(async () => 3) });
    const res = makeRes();
    await deleteReference.handle(makeReq('/api/references/A-1/delete', body), res, c as any);
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'reference in use', instanceCount: 3 });
    expect(c.deleteItemReference).not.toHaveBeenCalled();
  });

  it('a missing reference is 404', async () => {
    const c = ctx({ getItemReference: jest.fn(async () => null) });
    const res = makeRes();
    await deleteReference.handle(makeReq('/api/references/A-1/delete', body), res, c as any);
    expect(res.status).toBe(404);
  });

  it('confirm=true is required', async () => {
    const c = ctx();
    const res = makeRes();
    await deleteReference.handle(makeReq('/api/references/A-1/delete', { actor: 'alice' }), res, c as any);
    expect(res.status).toBe(400);
    expect(c.deleteItemReference).not.toHaveBeenCalled();
  });

  it('matches only its own route', () => {
    expect(deleteReference.matches('/api/references/A-1/delete', 'POST')).toBe(true);
    expect(deleteReference.matches('/api/references/A-1/delete', 'GET')).toBe(false);
    expect(deleteReference.matches('/api/items/A-1/delete', 'POST')).toBe(false);
  });
});
