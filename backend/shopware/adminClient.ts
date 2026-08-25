import { randomBytes } from 'crypto';
import type { ShopwareConfig } from '../config';
import { summarizeShopwareErrorBody } from './client';

// Admin-API write client (distinct from the store-api read client in client.ts). Admin writes
// authenticate with a bearer token — an integration's client-credentials grant, or a static token —
// NOT the sales-channel access key. Handles product resolve / create-if-missing / absolute-stock set.

export interface ShopwareAdminClientOptions {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  now?: () => number;
}

// One item-reference's current state, mapped to what a Shopware product needs.
export interface ShopwareProductSnapshot {
  productNumber: string;
  name: string;
  stock: number;
  grossPrice: number | null;
  shopwareProductId?: string | null;
}

export interface ShopwareUpsertResult {
  action: 'created' | 'updated';
  productId: string;
}

function uuid32(): string {
  return randomBytes(16).toString('hex');
}

export class ShopwareAdminClient {
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly accessToken: string | null;
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly requestTimeoutMs: number;
  private token: string | null = null;
  private tokenExpiry = 0;
  private cachedTaxId: string | null;
  private cachedTaxRate: number | null = null;
  private cachedCurrencyId: string | null;

  constructor(private readonly config: ShopwareConfig, options: ShopwareAdminClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch implementation required for ShopwareAdminClient');
    }
    this.logger = options.logger ?? console;
    this.now = options.now ?? Date.now;

    if (!config.baseUrl) {
      throw new Error('Shopware baseUrl must be configured for admin writes');
    }
    const creds = config.credentials ?? {};
    const hasClientCredentials = Boolean(creds.clientId && creds.clientSecret);
    if (!hasClientCredentials && !creds.accessToken) {
      throw new Error('Shopware admin writes need client credentials or an access token');
    }
    this.baseUrl = config.baseUrl;
    this.accessToken = creds.accessToken ?? null;
    this.clientId = creds.clientId ?? null;
    this.clientSecret = creds.clientSecret ?? null;
    this.requestTimeoutMs = Math.max(1, config.requestTimeoutMs);
    this.cachedTaxId = config.defaultTaxId ?? null;
    this.cachedCurrencyId = config.defaultCurrencyId ?? null;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.requestTimeoutMs) : null;
    try {
      return await this.fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    // Prefer a client-credentials grant (integration) since admin tokens expire; fall back to a
    // static access token when that is all that is configured.
    if (this.clientId && this.clientSecret) {
      const now = this.now();
      if (this.token && now < this.tokenExpiry) {
        return this.token;
      }
      const res = await this.fetchWithTimeout(new URL('/api/oauth/token', this.baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Shopware admin token request failed with status ${res.status}: ${summarizeShopwareErrorBody(text)}`);
      }
      const data = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!data.access_token) {
        throw new Error('Shopware admin token response missing access_token');
      }
      this.token = data.access_token;
      const ttl = Number.isFinite(data.expires_in) && (data.expires_in as number) > 0 ? (data.expires_in as number) * 1000 : 5 * 60 * 1000;
      // Refresh a minute early to avoid using a token that expires mid-request.
      this.tokenExpiry = this.now() + Math.max(0, ttl - 60_000);
      return this.token;
    }
    return this.accessToken as string;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
    const token = await this.getToken();
    const res = await this.fetchWithTimeout(new URL(path, this.baseUrl).toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Shopware admin ${method} ${path} failed with status ${res.status}: ${summarizeShopwareErrorBody(text)}`);
      (err as { status?: number }).status = res.status;
      throw err;
    }
    if (res.status === 204) {
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  }

  private async resolveTaxId(): Promise<{ id: string; rate: number }> {
    if (this.cachedTaxId) {
      return { id: this.cachedTaxId, rate: this.cachedTaxRate ?? 0 };
    }
    const data = await this.request<{ data?: Array<{ id: string; taxRate?: number; attributes?: { taxRate?: number } }> }>(
      'POST',
      '/api/search/tax',
      { limit: 50 }
    );
    const taxes = data?.data ?? [];
    if (!taxes.length) {
      throw new Error('Shopware has no tax rates configured; set SHOPWARE_DEFAULT_TAX_ID');
    }
    // Pick the highest rate as the "standard" rate (heuristic when no explicit default is set).
    const best = taxes
      .map((t) => ({ id: t.id, rate: Number(t.taxRate ?? t.attributes?.taxRate ?? 0) }))
      .sort((a, b) => b.rate - a.rate)[0];
    this.cachedTaxId = best.id;
    this.cachedTaxRate = best.rate;
    return best;
  }

  private async resolveCurrencyId(): Promise<string> {
    if (this.cachedCurrencyId) {
      return this.cachedCurrencyId;
    }
    const data = await this.request<{ data?: Array<{ id: string }> }>('POST', '/api/search/currency', {
      filter: [{ type: 'equals', field: 'isSystemDefault', value: true }],
      limit: 1
    });
    const id = data?.data?.[0]?.id ?? null;
    // Fall back to Shopware's well-known default EUR currency id.
    this.cachedCurrencyId = id ?? 'b7d2554b0ce847cd82f3ac9bd1c0dfca';
    return this.cachedCurrencyId;
  }

  async findProductIdByNumber(productNumber: string): Promise<string | null> {
    const data = await this.request<{ data?: Array<{ id: string }> }>('POST', '/api/search/product', {
      filter: [{ type: 'equals', field: 'productNumber', value: productNumber }],
      includes: { product: ['id'] },
      limit: 1
    });
    return data?.data?.[0]?.id ?? null;
  }

  async updateProductStock(productId: string, stock: number): Promise<void> {
    await this.request('PATCH', `/api/product/${productId}`, { stock: Math.max(0, Math.trunc(stock)) });
  }

  async createProduct(snapshot: ShopwareProductSnapshot): Promise<string> {
    const [{ id: taxId, rate }, currencyId] = await Promise.all([this.resolveTaxId(), this.resolveCurrencyId()]);
    const gross = snapshot.grossPrice ?? 0;
    const net = rate > 0 ? Number((gross / (1 + rate / 100)).toFixed(4)) : gross;
    const id = uuid32();
    await this.request('POST', '/api/product', {
      id,
      name: snapshot.name || snapshot.productNumber,
      productNumber: snapshot.productNumber,
      stock: Math.max(0, Math.trunc(snapshot.stock)),
      taxId,
      price: [{ currencyId, gross, net, linked: true }]
    });
    return id;
  }

  // Idempotent: match by productNumber, update absolute stock if it exists, else create it.
  async upsertProductStock(snapshot: ShopwareProductSnapshot): Promise<ShopwareUpsertResult> {
    const existingId = snapshot.shopwareProductId || (await this.findProductIdByNumber(snapshot.productNumber));
    if (existingId) {
      await this.updateProductStock(existingId, snapshot.stock);
      return { action: 'updated', productId: existingId };
    }
    const productId = await this.createProduct(snapshot);
    return { action: 'created', productId };
  }
}

export function createShopwareAdminClient(
  config: ShopwareConfig,
  options: ShopwareAdminClientOptions = {}
): ShopwareAdminClient {
  return new ShopwareAdminClient(config, options);
}
