// Unit tests for the P1 write path: ShopwareAdminClient (resolve / create-if-missing / absolute stock)
// and the sync dispatch client (skip / persist id / retry classification). Injected fetch + fakes, no
// network or DB. Jest-ignored like the other shopware-*.test.ts (harness gap, todo #52); logic verified.

import { createShopwareAdminClient } from '../backend/shopware/adminClient';
import { createShopwareSyncClient } from '../backend/shopware/syncClient';
import type { ShopwareConfig } from '../backend/config';

const cfg: ShopwareConfig = {
  enabled: true, baseUrl: 'https://shop.example', salesChannelAccessKey: 'SWSC',
  requestTimeoutMs: 5000, credentials: { clientId: 'cid', clientSecret: 'sec' }
};
const log = { info() {}, warn() {}, error() {} };

interface Call { url: string; method: string; body?: any }
function mkFetch(routes: Array<{ match: (u: string, i: any) => boolean; res: (u: string, i: any) => { status: number; body?: any } }>, calls: Call[]) {
  return async (url: unknown, init: any = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    const r = routes.find((x) => x.match(u, init));
    const { status, body } = r ? r.res(u, init) : { status: 404, body: { errors: [{ code: 'NO_MATCH' }] } };
    return { ok: status >= 200 && status < 300, status, async json() { return body ?? {}; }, async text() { return JSON.stringify(body ?? {}); } } as unknown as Response;
  };
}
const tokenRoute = { match: (u: string) => u.includes('/api/oauth/token'), res: () => ({ status: 200, body: { access_token: 't', expires_in: 600 } }) };

describe('ShopwareAdminClient.upsertProductStock', () => {
  test('updates absolute stock on an existing product (no create)', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [{ id: 'prod123' }] } }) },
      { match: (u, i) => /\/api\/product\/prod123$/.test(u) && i.method === 'PATCH', res: () => ({ status: 204 }) }
    ], calls) });
    const r = await admin.upsertProductStock({ productNumber: 'A-1', name: 'Widget', stock: 7, grossPrice: 119 });
    expect(r.action).toBe('updated');
    expect(r.productId).toBe('prod123');
    expect(calls.find((c) => c.method === 'PATCH')?.body.stock).toBe(7);
    expect(calls.some((c) => c.method === 'POST' && /\/api\/product$/.test(c.url))).toBe(false);
  });

  test('creates a product when none matches, with resolved tax/currency and computed net', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [] } }) },
      { match: (u) => u.includes('/api/search/tax'), res: () => ({ status: 200, body: { data: [{ id: 'tax19', taxRate: 19 }, { id: 'tax7', taxRate: 7 }] } }) },
      { match: (u) => u.includes('/api/search/currency'), res: () => ({ status: 200, body: { data: [{ id: 'eur' }] } }) },
      { match: (u, i) => /\/api\/product$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) }
    ], calls) });
    const r = await admin.upsertProductStock({ productNumber: 'B-2', name: 'New', stock: 3, grossPrice: 119 });
    expect(r.action).toBe('created');
    expect(r.productId).toMatch(/^[0-9a-f]{32}$/);
    const create = calls.find((c) => c.method === 'POST' && /\/api\/product$/.test(c.url));
    expect(create?.body.taxId).toBe('tax19'); // highest rate chosen as standard
    expect(create?.body.stock).toBe(3);
    expect(create?.body.price[0].currencyId).toBe('eur');
    expect(Math.abs(create?.body.price[0].net - 119 / 1.19)).toBeLessThan(0.01);
  });
});

describe('createShopwareSyncClient.dispatchJob', () => {
  const snap = { productNumber: 'A-1', name: 'n', stock: 5, grossPrice: 1 };

  test('skips (ok) when no matching item is found', async () => {
    let upserts = 0;
    const client = createShopwareSyncClient({
      adminClient: { upsertProductStock: async () => { upserts++; return { action: 'updated', productId: 'x' }; } },
      loadSnapshot: async () => null, logger: log
    });
    const r = await client.dispatchJob({ correlationId: 'c', jobType: 'item-upsert', payload: {}, attempt: 1 });
    expect(r.ok).toBe(true);
    expect(upserts).toBe(0);
  });

  test('persists the new product id after a create', async () => {
    let persisted: { pn: string; pid: string } | null = null;
    const client = createShopwareSyncClient({
      adminClient: { upsertProductStock: async () => ({ action: 'created', productId: 'newid' }) },
      loadSnapshot: async () => snap,
      persistProductId: async (pn, pid) => { persisted = { pn, pid }; }, logger: log
    });
    const r = await client.dispatchJob({ correlationId: 'c', jobType: 'item-upsert', payload: { artikelNummer: 'A-1' }, attempt: 1 });
    expect(r.ok).toBe(true);
    expect(persisted).toEqual({ pn: 'A-1', pid: 'newid' });
  });

  test('classifies 4xx as terminal and 5xx/network as retryable', async () => {
    for (const [status, wantRetry] of [[400, false], [500, true], [undefined, true]] as const) {
      const client = createShopwareSyncClient({
        adminClient: { upsertProductStock: async () => { const e: any = new Error('boom'); if (status !== undefined) e.status = status; throw e; } },
        loadSnapshot: async () => snap, logger: log
      });
      const r = await client.dispatchJob({ correlationId: 'c', jobType: 'stock-decrement', payload: { itemUUID: 'u' }, attempt: 1 });
      expect(r.ok).toBe(false);
      expect(r.retryable).toBe(wantRetry);
    }
  });
});
