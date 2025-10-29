import { Readable } from 'stream';
import type { IncomingMessage } from 'http';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const searchShopwareAction = require('../backend/actions/searchShopware').default as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  __setShopwareSearchClientForTests,
  __resetShopwareSearchClient
} = require('../backend/actions/searchShopware');

import type { ShopwareSearchClient, ShopwareSearchProduct } from '../backend/shopware/client';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (chunk?: unknown) => void;
};

function createJsonRequest(body: unknown): IncomingMessage {
  const payload = JSON.stringify(body ?? {});
  const stream = Readable.from([payload]) as Readable & { method: string; headers: Record<string, string>; url: string };
  stream.method = 'POST';
  stream.headers = { 'content-type': 'application/json' };
  stream.url = '/api/shopware/search';
  return stream as unknown as IncomingMessage;
}

function createResponse(): MockResponse {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      if (chunk) {
        this.body = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      }
    }
  };
}

class StubShopwareClient implements ShopwareSearchClient {
  constructor(private readonly products: ShopwareSearchProduct[], private readonly error?: Error) {}

  async searchProducts(): Promise<ShopwareSearchProduct[]> {
    if (this.error) {
      throw this.error;
    }
    return this.products;
  }
}

afterEach(() => {
  __resetShopwareSearchClient();
});

describe('searchShopware action', () => {
  test('returns transformed results from client override', async () => {
    const products: ShopwareSearchProduct[] = [
      {
        id: 'p1',
        name: 'Adapter',
        artikelNummer: 'SKU-1',
        description: 'Adapter description',
        manufacturer: 'Adapters GmbH',
        price: 9.99,
        currency: 'EUR',
        url: 'https://shop.local/adapter',
        mediaUrl: 'https://shop.local/media/adapter.png',
        dimensions: {
          length_mm: 10,
          width_mm: 5,
          height_mm: 2,
          weight_kg: 0.1
        }
      }
    ];
    __setShopwareSearchClientForTests(new StubShopwareClient(products));

    const req = createJsonRequest({ query: 'Adapter', limit: 3 });
    const res = createResponse();

    await searchShopwareAction.handle(req, res as unknown as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBe(1);
    expect(body.products[0]).toEqual(products[0]);
  });

  test('returns empty list when client returns no products', async () => {
    __setShopwareSearchClientForTests(new StubShopwareClient([]));

    const req = createJsonRequest({ query: 'Unknown' });
    const res = createResponse();

    await searchShopwareAction.handle(req, res as unknown as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBe(0);
  });

  test('returns 502 when client throws an error', async () => {
    __setShopwareSearchClientForTests(new StubShopwareClient([], new Error('search failed')));

    const req = createJsonRequest({ query: 'Adapter' });
    const res = createResponse();

    await searchShopwareAction.handle(req, res as unknown as any);

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 503 when integration is not configured', async () => {
    const req = createJsonRequest({ query: 'Adapter' });
    const res = createResponse();

    await searchShopwareAction.handle(req, res as unknown as any);

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });
});
