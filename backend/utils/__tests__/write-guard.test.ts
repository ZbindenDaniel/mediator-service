import type { ServerResponse } from 'http';

jest.mock('../../db', () => ({
  getRowOwner: jest.fn(async (_kind: string, id: string) => ({ own: 'a', foreign: 'b', legacy: null } as Record<string, string | null>)[id]),
  getItemOwners: jest.fn(async (ids: string[]) => new Map(ids.filter((i) => i !== 'missing').map((i) => [i, i.startsWith('b') ? 'b' : 'a']))),
  getRefOwners: jest.fn(async () => new Map())
}));

import { guardCreate, guardWrite, guardWriteMany } from '../write-guard';

const orgA = { identity: { authenticated: true, username: 'x', groups: [], tenant: 'a', role: 'normal' as const } };
function res() {
  const r = { status: 0, body: '' as string, writeHead(s: number) { r.status = s; }, end(b: string) { r.body = b; } };
  return r;
}

describe('write guards', () => {
  it('passes own rows and missing rows (handler answers 404 itself)', async () => {
    expect(await guardWrite(orgA, res() as unknown as ServerResponse, 'item', 'own')).toBe(true);
    expect(await guardWrite(orgA, res() as unknown as ServerResponse, 'item', 'nope')).toBe(true);
  });

  it("rejects another org's row with 403", async () => {
    const r = res();
    expect(await guardWrite(orgA, r as unknown as ServerResponse, 'box', 'foreign')).toBe(false);
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body)).toMatchObject({ kind: 'box', id: 'foreign' });
  });

  it('bulk: all-or-nothing and lists the foreign rows', async () => {
    const r = res();
    expect(await guardWriteMany(orgA, r as unknown as ServerResponse, 'item', ['a1', 'b1', 'b2', 'missing'])).toBe(false);
    expect(JSON.parse(r.body).ids).toEqual(['b1', 'b2']);
    expect(await guardWriteMany(orgA, res() as unknown as ServerResponse, 'item', ['a1', 'a2'])).toBe(true);
  });

  it('blocks creation for a logged-in user without org', () => {
    const r = res();
    expect(guardCreate({ identity: { ...orgA.identity, tenant: null, role: null } }, r as unknown as ServerResponse)).toBe(false);
    expect(r.status).toBe(403);
  });
});
