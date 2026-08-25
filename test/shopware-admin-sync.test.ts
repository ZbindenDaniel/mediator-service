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

describe('ShopwareAdminClient.upsertProduct', () => {
  const taxRoute = { match: (u: string) => u.includes('/api/search/tax'), res: () => ({ status: 200, body: { data: [{ id: 'tax19', taxRate: 19 }] } }) };
  const salesChannelRoute = { match: (u: string) => u.includes('/api/search/sales-channel'), res: () => ({ status: 200, body: { data: [{ id: 'sc1', currencyId: 'chf' }] } }) };

  test('updates an existing product with full data (name, price, active, stock) — not just stock', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute, taxRoute, salesChannelRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [{ id: 'prod123' }] } }) },
      { match: (u, i) => /\/api\/product\/prod123$/.test(u) && i.method === 'PATCH', res: () => ({ status: 204 }) }
    ], calls) });
    const r = await admin.upsertProduct({ productNumber: 'A-1', name: 'Widget', description: 'A nice widget', stock: 7, grossPrice: 119, active: true, shopEligible: true });
    expect(r.action).toBe('updated');
    expect(r.productId).toBe('prod123');
    const patch = calls.find((c) => c.method === 'PATCH' && /\/api\/product\/prod123$/.test(c.url));
    expect(patch?.body.stock).toBe(7);
    expect(patch?.body.name).toBe('Widget');
    expect(patch?.body.description).toBe('A nice widget');
    expect(patch?.body.active).toBe(true);
    expect(patch?.body.price[0].currencyId).toBe('chf');
    expect(calls.some((c) => c.method === 'POST' && /\/api\/product$/.test(c.url))).toBe(false);
  });

  test('does not publish an ineligible item: deactivates if it exists, skips if not', async () => {
    // exists → deactivate
    const calls1: Call[] = [];
    const admin1 = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [{ id: 'prodE' }] } }) },
      { match: (u, i) => /\/api\/product\/prodE$/.test(u) && i.method === 'PATCH', res: () => ({ status: 204 }) }
    ], calls1) });
    const r1 = await admin1.upsertProduct({ productNumber: 'A-1', name: 'X', stock: 5, grossPrice: 10, shopEligible: false });
    expect(r1.action).toBe('deactivated');
    expect(calls1.find((c) => c.method === 'PATCH')?.body.active).toBe(false);
    expect(calls1.some((c) => c.method === 'POST' && /\/api\/product$/.test(c.url))).toBe(false);

    // not found → skip (no writes at all)
    const calls2: Call[] = [];
    const admin2 = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [] } }) }
    ], calls2) });
    const r2 = await admin2.upsertProduct({ productNumber: 'B-9', name: 'Y', stock: 1, grossPrice: 10, shopEligible: false });
    expect(r2.action).toBe('skipped');
    expect(r2.productId).toBeNull();
    expect(calls2.some((c) => c.method === 'PATCH' || (c.method === 'POST' && /\/api\/product$/.test(c.url)))).toBe(false);
  });

  test('creates a product when none matches, with resolved tax/currency and computed net', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [] } }) },
      { match: (u) => u.includes('/api/search/tax'), res: () => ({ status: 200, body: { data: [{ id: 'tax19', taxRate: 19 }, { id: 'tax7', taxRate: 7 }] } }) },
      // Currency + visibility resolve via the sales channel (its own currency, e.g. CHF), not the runtime isSystemDefault field.
      { match: (u) => u.includes('/api/search/sales-channel'), res: () => ({ status: 200, body: { data: [{ id: 'sc1', currencyId: 'chf' }] } }) },
      { match: (u, i) => /\/api\/product$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) }
    ], calls) });
    const r = await admin.upsertProduct({ productNumber: 'B-2', name: 'New', stock: 3, grossPrice: 119, shopEligible: true });
    expect(r.action).toBe('created');
    expect(r.productId).toMatch(/^[0-9a-f]{32}$/);
    const create = calls.find((c) => c.method === 'POST' && /\/api\/product$/.test(c.url));
    expect(create?.body.taxId).toBe('tax19'); // highest rate chosen as standard
    expect(create?.body.stock).toBe(3);
    expect(create?.body.price[0].currencyId).toBe('chf'); // sales-channel currency
    expect(Math.abs(create?.body.price[0].net - 119 / 1.19)).toBeLessThan(0.01);
    expect(create?.body.visibilities[0].salesChannelId).toBe('sc1'); // published product gets storefront visibility
    // never queries the runtime isSystemDefault field
    expect(calls.some((c) => c.url.includes('/api/search/currency'))).toBe(false);
  });

  test('syncs Langtext into filterable properties: creates missing group/option, links, removes stale', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute, taxRoute, salesChannelRoute,
      { match: (u) => u.includes('/api/search/product'), res: () => ({ status: 200, body: { data: [{ id: 'prodX' }] } }) },
      { match: (u, i) => /\/api\/product\/prodX$/.test(u) && i.method === 'PATCH', res: () => ({ status: 204 }) },
      // RAM group missing → created; option missing → created (exact-path matchers so
      // /property-group does not shadow /property-group-option)
      { match: (u) => /\/api\/search\/property-group$/.test(u), res: () => ({ status: 200, body: { data: [] } }) },
      { match: (u, i) => /\/api\/property-group$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) },
      { match: (u) => /\/api\/search\/property-group-option$/.test(u), res: () => ({ status: 200, body: { data: [] } }) },
      { match: (u, i) => /\/api\/property-group-option$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) },
      // product currently has one stale option 'staleopt'
      { match: (u, i) => /\/api\/product\/prodX\/properties/.test(u) && i.method === 'GET', res: () => ({ status: 200, body: { data: [{ id: 'staleopt' }] } }) },
      { match: (u, i) => /\/api\/product\/prodX\/properties\/staleopt$/.test(u) && i.method === 'DELETE', res: () => ({ status: 204 }) }
    ], calls) });

    await admin.upsertProduct({ productNumber: 'A-1', name: 'PC', stock: 1, grossPrice: 10, properties: { RAM: '16 GB' } });

    expect(calls.some((c) => c.method === 'POST' && /\/api\/property-group$/.test(c.url) && c.body.name === 'RAM' && c.body.filterable === true)).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && /\/api\/property-group-option$/.test(c.url) && c.body.name === '16 GB')).toBe(true);
    // full desired list PATCHed onto the product, stale option deleted
    const propPatch = calls.filter((c) => c.method === 'PATCH' && /\/api\/product\/prodX$/.test(c.url)).find((c) => Array.isArray(c.body.properties));
    expect(propPatch?.body.properties.length).toBe(1);
    expect(calls.some((c) => c.method === 'DELETE' && /properties\/staleopt$/.test(c.url))).toBe(true);
  });
});

describe('ShopwareAdminClient variant sync', () => {
  const taxRoute = { match: (u: string) => u.includes('/api/search/tax'), res: () => ({ status: 200, body: { data: [{ id: 'tax19', taxRate: 19 }] } }) };
  const salesChannelRoute = { match: (u: string) => u.includes('/api/search/sales-channel'), res: () => ({ status: 200, body: { data: [{ id: 'sc1', currencyId: 'chf' }] } }) };
  const filterVal = (body: any, field: string) => (body?.filter || []).find((x: any) => x.field === field)?.value;

  test('creates one child per InstanceSpecs combo, sets configurator axes, retires stale children', async () => {
    const calls: Call[] = [];
    const admin = createShopwareAdminClient(cfg, { logger: log, fetchImpl: mkFetch([
      tokenRoute, taxRoute, salesChannelRoute,
      { match: (u) => /\/api\/search\/property-group$/.test(u), res: () => ({ status: 200, body: { data: [{ id: 'GRAM' }] } }) },
      { match: (u) => /\/api\/search\/property-group-option$/.test(u), res: () => ({ status: 200, body: { data: [] } }) },
      { match: (u, i) => /\/api\/property-group-option$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) },
      { match: (u) => u.includes('/api/search/product'), res: (_u, i) => {
          const body = i.body ? JSON.parse(i.body) : undefined;
          if (filterVal(body, 'parentId') === 'PAR') return { status: 200, body: { data: [{ id: 'STALE', productNumber: 'A.oldhash00' }] } };
          if (filterVal(body, 'productNumber') === 'A') return { status: 200, body: { data: [{ id: 'PAR' }] } };
          return { status: 200, body: { data: [] } };
        } },
      { match: (u, i) => /\/api\/product\/(PAR|STALE)$/.test(u) && i.method === 'PATCH', res: () => ({ status: 204 }) },
      { match: (u, i) => /\/api\/product$/.test(u) && i.method === 'POST', res: () => ({ status: 204 }) }
    ], calls) });

    const result = await admin.upsertProduct({
      productNumber: 'A', name: 'N', stock: 3, grossPrice: 100, active: true, shopEligible: true,
      variants: [
        { key: 'RAM=8 GB', options: { RAM: '8 GB' }, stock: 1, instanceIds: ['i1'] },
        { key: 'RAM=16 GB', options: { RAM: '16 GB' }, stock: 2, instanceIds: ['i2', 'i3'] }
      ]
    });

    const childCreates = calls.filter((c) => c.method === 'POST' && /\/api\/product$/.test(c.url) && c.body?.parentId === 'PAR');
    expect(childCreates.length).toBe(2);
    expect(childCreates.every((c) => Array.isArray(c.body.options) && c.body.options.length === 1)).toBe(true);
    expect(childCreates.map((c) => c.body.stock).sort()).toEqual([1, 2]);
    const cfgPatch = calls.find((c) => c.method === 'PATCH' && /\/api\/product\/PAR$/.test(c.url) && Array.isArray(c.body.configuratorSettings));
    expect(cfgPatch?.body.configuratorSettings.length).toBe(2);
    const stale = calls.find((c) => c.method === 'PATCH' && /\/api\/product\/STALE$/.test(c.url));
    expect(stale?.body.active).toBe(false);
    expect(stale?.body.stock).toBe(0);
    expect(result.variantAssignments?.length).toBe(2);
    expect((result.variantAssignments || []).flatMap((a) => a.instanceIds).sort()).toEqual(['i1', 'i2', 'i3']);
  });
});

describe('createShopwareSyncClient.dispatchJob', () => {
  const snap = { productNumber: 'A-1', name: 'n', stock: 5, grossPrice: 1 };

  test('skips (ok) when no matching item is found', async () => {
    let upserts = 0;
    const client = createShopwareSyncClient({
      adminClient: { upsertProduct: async () => { upserts++; return { action: 'updated', productId: 'x' }; } },
      loadSnapshot: async () => null, logger: log
    });
    const r = await client.dispatchJob({ correlationId: 'c', jobType: 'item-upsert', payload: {}, attempt: 1 });
    expect(r.ok).toBe(true);
    expect(upserts).toBe(0);
  });

  test('persists the new product id after a create', async () => {
    let persisted: { pn: string; pid: string } | null = null;
    const client = createShopwareSyncClient({
      adminClient: { upsertProduct: async () => ({ action: 'created', productId: 'newid' }) },
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
        adminClient: { upsertProduct: async () => { const e: any = new Error('boom'); if (status !== undefined) e.status = status; throw e; } },
        loadSnapshot: async () => snap, logger: log
      });
      const r = await client.dispatchJob({ correlationId: 'c', jobType: 'stock-decrement', payload: { itemUUID: 'u' }, attempt: 1 });
      expect(r.ok).toBe(false);
      expect(r.retryable).toBe(wantRetry);
    }
  });
});
