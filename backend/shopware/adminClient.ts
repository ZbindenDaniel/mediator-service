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
  // Parsed Langtext/Spezifikationen → filterable Shopware properties (group name → option value(s)).
  properties?: Record<string, string | string[]> | null;
}

export interface ShopwareUpsertResult {
  action: 'created' | 'updated';
  productId: string;
}

function uuid32(): string {
  return randomBytes(16).toString('hex');
}

// Shopware's hard-coded system default currency id (EUR), seeded in every install (Defaults::CURRENCY).
const SYSTEM_DEFAULT_CURRENCY_ID = 'b7d2554b0ce847cd82f3ac9bd1c0dfca';

export class ShopwareAdminClient {
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly accessToken: string | null;
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly salesChannelAccessKey: string | null;
  private readonly requestTimeoutMs: number;
  private token: string | null = null;
  private tokenExpiry = 0;
  private cachedTaxId: string | null;
  private cachedTaxRate: number | null = null;
  private cachedCurrencyId: string | null;
  // Property group/option ids are stable once created, so cache across jobs to avoid re-resolving.
  private readonly groupCache = new Map<string, string>();
  private readonly optionCache = new Map<string, string>();

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
    this.salesChannelAccessKey = config.salesChannelAccessKey ?? null;
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
    // Prefer the configured sales channel's own currency (what its storefront prices in — e.g. CHF for a
    // Swiss shop). `isSystemDefault` is a Shopware runtime field and CANNOT be used in a search criteria,
    // so resolve via the sales channel (accessKey is a real, filterable field) instead.
    let id: string | null = null;
    if (this.salesChannelAccessKey) {
      try {
        const sc = await this.request<{ data?: Array<{ currencyId?: string }> }>('POST', '/api/search/sales-channel', {
          filter: [{ type: 'equals', field: 'accessKey', value: this.salesChannelAccessKey }],
          includes: { sales_channel: ['currencyId'] },
          limit: 1
        });
        id = sc?.data?.[0]?.currencyId ?? null;
      } catch (err) {
        this.logger.warn?.('[shopware-admin-client] Failed to resolve sales-channel currency; using system default', err);
      }
    }
    if (id) {
      this.cachedCurrencyId = id;
      return id;
    }
    // Fall back to Shopware's well-known system default currency id (EUR, always seeded) WITHOUT caching,
    // so a transient sales-channel lookup failure doesn't pin the wrong currency for the process lifetime.
    return SYSTEM_DEFAULT_CURRENCY_ID;
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

  // Ensure a filterable property group exists for `name`; returns its id (cached).
  private async ensurePropertyGroup(name: string): Promise<string> {
    const key = name.trim();
    const cached = this.groupCache.get(key);
    if (cached) return cached;
    const found = await this.request<{ data?: Array<{ id: string }> }>('POST', '/api/search/property-group', {
      filter: [{ type: 'equals', field: 'name', value: key }],
      includes: { property_group: ['id'] },
      limit: 1
    });
    let id = found?.data?.[0]?.id ?? null;
    if (!id) {
      id = uuid32();
      await this.request('POST', '/api/property-group', {
        id,
        name: key,
        displayType: 'text',
        sortingType: 'alphanumeric',
        filterable: true
      });
    }
    this.groupCache.set(key, id);
    return id;
  }

  // Ensure an option `value` exists within a group; returns its id (cached per group+value).
  private async ensurePropertyOption(groupId: string, value: string): Promise<string> {
    const v = value.trim();
    const cacheKey = `${groupId} ${v}`;
    const cached = this.optionCache.get(cacheKey);
    if (cached) return cached;
    const found = await this.request<{ data?: Array<{ id: string }> }>('POST', '/api/search/property-group-option', {
      filter: [
        { type: 'equals', field: 'groupId', value: groupId },
        { type: 'equals', field: 'name', value: v }
      ],
      includes: { property_group_option: ['id'] },
      limit: 1
    });
    let id = found?.data?.[0]?.id ?? null;
    if (!id) {
      id = uuid32();
      await this.request('POST', '/api/property-group-option', { id, groupId, name: v });
    }
    this.optionCache.set(cacheKey, id);
    return id;
  }

  // Set the product's property associations to exactly the options implied by `payload`
  // (group name → value(s)). Missing groups/options are created as filterable properties.
  async syncProductProperties(productId: string, payload: Record<string, string | string[]>): Promise<void> {
    const desired = new Set<string>();
    for (const [group, raw] of Object.entries(payload)) {
      const groupName = group.trim();
      if (!groupName) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      let groupId: string | null = null;
      for (const value of values) {
        const v = String(value ?? '').trim();
        if (!v) continue;
        groupId = groupId ?? (await this.ensurePropertyGroup(groupName));
        desired.add(await this.ensurePropertyOption(groupId, v));
      }
    }

    const current = await this.request<{ data?: Array<{ id: string }> }>('GET', `/api/product/${productId}/properties?limit=500`);
    const currentIds = new Set((current?.data ?? []).map((o) => o.id));
    const toRemove = [...currentIds].filter((id) => !desired.has(id));

    // Robust to either Shopware association-write semantic: PATCH the full desired list (a "replace"
    // build lands exactly this; an "upsert" build just adds), then explicitly delete anything stale
    // (a no-op 404 if the replace already removed it).
    const desiredIds = [...desired];
    if (desiredIds.length) {
      await this.request('PATCH', `/api/product/${productId}`, { id: productId, properties: desiredIds.map((id) => ({ id })) });
    }
    for (const id of toRemove) {
      try {
        await this.request('DELETE', `/api/product/${productId}/properties/${id}`);
      } catch (err) {
        if ((err as { status?: number }).status !== 404) throw err;
      }
    }
  }

  // Idempotent: match by productNumber, update absolute stock if it exists, else create it; then
  // reconcile its filterable properties from the snapshot's Langtext-derived spec map.
  async upsertProduct(snapshot: ShopwareProductSnapshot): Promise<ShopwareUpsertResult> {
    const existingId = snapshot.shopwareProductId || (await this.findProductIdByNumber(snapshot.productNumber));
    let result: ShopwareUpsertResult;
    if (existingId) {
      await this.updateProductStock(existingId, snapshot.stock);
      result = { action: 'updated', productId: existingId };
    } else {
      result = { action: 'created', productId: await this.createProduct(snapshot) };
    }

    if (snapshot.properties && Object.keys(snapshot.properties).length > 0) {
      await this.syncProductProperties(result.productId, snapshot.properties);
    }
    return result;
  }
}

export function createShopwareAdminClient(
  config: ShopwareConfig,
  options: ShopwareAdminClientOptions = {}
): ShopwareAdminClient {
  return new ShopwareAdminClient(config, options);
}
