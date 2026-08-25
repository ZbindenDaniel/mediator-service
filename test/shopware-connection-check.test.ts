// Unit tests for ShopwareClient.checkConnection() — the probe behind the admin
// "Verbindung testen" button (GET/POST /api/admin/shopware/*). Uses an injected fetch
// mock so no network is touched. Verified logic mirrors backend/shopware/client.ts.
//
// NOTE: like the other test/shopware-*.test.ts files, this currently sits in jest's
// testPathIgnorePatterns because the local esbuild harness cannot resolve the client's
// module graph (todo.md #52). Kept in-repo so it runs once that harness/CI gap is closed.

import { createShopwareClient } from '../backend/shopware/client';
import type { ShopwareConfig } from '../backend/config';

const baseConfig: ShopwareConfig = {
  enabled: true,
  baseUrl: 'https://shop.example',
  salesChannelId: 'SWSCTESTKEY',
  requestTimeoutMs: 5000,
  credentials: { clientId: 'cid', clientSecret: 'csecret' }
};

const silentLogger = { info() {}, warn() {}, error() {} };

function mockFetch(handler: (url: string) => { status: number; body: unknown }) {
  return async (url: unknown) => {
    const { status, body } = handler(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() { return body; },
      async text() { return typeof body === 'string' ? body : JSON.stringify(body); }
    } as unknown as Response;
  };
}

describe('ShopwareClient.checkConnection', () => {
  test('reports ok when token and store-api search both succeed', async () => {
    const client = createShopwareClient(baseConfig, {
      logger: silentLogger,
      fetchImpl: mockFetch((url) =>
        url.includes('/api/oauth/token')
          ? { status: 200, body: { access_token: 'tok', expires_in: 600 } }
          : { status: 200, body: { elements: [{ id: 'p1', productNumber: 'A-1', name: 'X' }] } })
    });

    const result = await client.checkConnection();

    expect(result.ok).toBe(true);
    expect(result.steps.length).toBe(2);
    expect(result.steps.every((s) => s.ok)).toBe(true);
    expect(result.productSampleCount).toBe(1);
  });

  test('stops at auth and parses the HTTP status when admin credentials are rejected', async () => {
    const client = createShopwareClient(baseConfig, {
      logger: silentLogger,
      fetchImpl: mockFetch(() => ({ status: 401, body: 'invalid_client' }))
    });

    const result = await client.checkConnection();

    expect(result.ok).toBe(false);
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].name).toBe('auth');
    expect(result.steps[0].ok).toBe(false);
    expect(result.steps[0].status).toBe(401);
  });

  test('marks the search step failed when the sales-channel key is rejected', async () => {
    const client = createShopwareClient(baseConfig, {
      logger: silentLogger,
      fetchImpl: mockFetch((url) =>
        url.includes('/api/oauth/token')
          ? { status: 200, body: { access_token: 'tok', expires_in: 600 } }
          : { status: 412, body: 'sales channel not found' })
    });

    const result = await client.checkConnection();

    expect(result.ok).toBe(false);
    expect(result.steps.length).toBe(2);
    expect(result.steps[0].ok).toBe(true);
    expect(result.steps[1].name).toBe('search');
    expect(result.steps[1].ok).toBe(false);
    expect(result.steps[1].status).toBe(412);
  });
});
