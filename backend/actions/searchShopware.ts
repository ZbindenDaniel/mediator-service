import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { SHOPWARE_CONFIG } from '../config';
import {
  createShopwareClient,
  type ShopwareSearchClient,
  type ShopwareSearchProduct
} from '../shopware/client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

let clientOverride: ShopwareSearchClient | null = null;
let sharedClient: ShopwareSearchClient | null = null;

function resolveClient(): ShopwareSearchClient | null {
  if (clientOverride) {
    return clientOverride;
  }
  if (!SHOPWARE_CONFIG) {
    return null;
  }
  if (!sharedClient) {
    sharedClient = createShopwareClient(SHOPWARE_CONFIG);
  }
  return sharedClient;
}

function normaliseLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(25, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(25, parsed));
    }
  }
  return 5;
}

const action = defineHttpAction({
  key: 'search-shopware',
  label: 'Search Shopware',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/shopware/search' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const payload = await readJsonBody(req);
      const queryRaw = payload.query;
      const limitRaw = payload.limit;
      const query = typeof queryRaw === 'string' ? queryRaw.trim() : '';
      const limit = normaliseLimit(limitRaw);

      if (!query) {
        console.warn('[shopware-search] Missing query parameter');
        return sendJson(res, 400, { ok: false, error: 'query is required' });
      }

      const client = resolveClient();
      if (!client) {
        console.warn('[shopware-search] Shopware integration not configured');
        return sendJson(res, 503, {
          ok: false,
          error: 'Shopware integration is not configured.'
        });
      }

      console.info('[shopware-search] Dispatching search request', {
        query,
        limit
      });

      let products: ShopwareSearchProduct[] = [];
      try {
        products = await client.searchProducts(query, limit);
      } catch (error) {
        console.error('[shopware-search] Search request failed', { query, error });
        return sendJson(res, 502, {
          ok: false,
          error: 'Shopware search failed.'
        });
      }

      console.info('[shopware-search] Search completed', {
        query,
        productCount: products.length
      });

      return sendJson(res, 200, { ok: true, products });
    } catch (error) {
      console.error('[shopware-search] Unexpected failure', error);
      return sendJson(res, 500, { ok: false, error: 'Unexpected error' });
    }
  },
  view: () => '<div class="card"><p class="muted">Shopware search API</p></div>'
});

export function __setShopwareSearchClientForTests(client: ShopwareSearchClient | null): void {
  clientOverride = client;
}

export function __resetShopwareSearchClient(): void {
  clientOverride = null;
  sharedClient = null;
}

export default action;
