import type { ShopwareConfiguration } from '../config';

export interface ShopwareSearchDimensions {
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_kg: number | null;
}

export interface ShopwareSearchProduct {
  id: string;
  name: string;
  artikelNummer: string | null;
  description: string | null;
  manufacturer: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  mediaUrl: string | null;
  dimensions: ShopwareSearchDimensions;
}

export interface ShopwareClientOptions {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  now?: () => number;
}

export interface ShopwareSearchClient {
  searchProducts(query: string, limit?: number): Promise<ShopwareSearchProduct[]>;
}

function normaliseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function determinePriceSource(product: any): {
  amount: number | null;
  currency: string | null;
} {
  const calculated = product?.calculatedPrice ?? {};
  const priceEntry = Array.isArray(product?.price) ? product.price[0] ?? {} : {};

  const amount =
    normaliseNumber(calculated?.totalPrice ?? calculated?.gross ?? calculated?.unitPrice) ??
    normaliseNumber(priceEntry?.gross ?? priceEntry?.net ?? priceEntry?.unitPrice);

  const currencyCandidate =
    calculated?.currency ??
    calculated?.currencyIsoCode ??
    calculated?.price?.currencyIsoCode ??
    priceEntry?.currency ??
    priceEntry?.currencyId ??
    priceEntry?.currencyIsoCode ??
    null;

  return {
    amount,
    currency: typeof currencyCandidate === 'string' ? currencyCandidate : null
  };
}

export class ShopwareClient implements ShopwareSearchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly now: () => number;
  private token: string | null = null;
  private tokenExpiry = 0;
  private tokenSignature: string | null = null;

  constructor(private readonly config: ShopwareConfiguration, options: ShopwareClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch implementation required for ShopwareClient');
    }
    this.logger = options.logger ?? console;
    this.now = options.now ?? Date.now;
  }

  private get tokenCacheKey(): string {
    return [this.config.baseUrl, this.config.clientId, this.config.clientSecret].join('|');
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = Math.max(1, this.config.timeoutMs);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const requestInit: RequestInit = { ...init };
    if (controller) {
      requestInit.signal = controller.signal;
    }

    try {
      return await this.fetchImpl(url, requestInit);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async getToken(): Promise<string> {
    const now = this.now();
    const signature = this.tokenCacheKey;

    if (this.token && this.tokenSignature === signature && now < this.tokenExpiry) {
      return this.token;
    }

    const tokenUrl = new URL('/api/oauth/token', this.config.baseUrl);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });

    this.logger.info?.('[shopware-client] Requesting OAuth token');

    let response: Response;
    try {
      response = await this.fetchWithTimeout(tokenUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
    } catch (error) {
      this.logger.error?.('[shopware-client] Token request network failure', error);
      throw error;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      const err = new Error(`Shopware token request failed with status ${response.status}: ${text}`);
      this.logger.error?.('[shopware-client] Token request rejected', err);
      throw err;
    }

    const payload = await response.json().catch((error) => {
      this.logger.error?.('[shopware-client] Token response JSON parse failed', error);
      throw error;
    });

    const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : null;
    const expiresIn = Number(payload?.expires_in);
    if (!accessToken) {
      const err = new Error('Shopware token response missing access_token');
      this.logger.error?.('[shopware-client] Token response invalid', err);
      throw err;
    }

    this.token = accessToken;
    this.tokenSignature = signature;
    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 5 * 60 * 1000;
    this.tokenExpiry = now + ttl;
    this.logger.info?.('[shopware-client] OAuth token acquired');
    return accessToken;
  }

  private resolveProductUrl(product: any): string | null {
    const candidates: string[] = [];

    if (typeof product?.url === 'string') {
      candidates.push(product.url);
    }

    const seoUrls: any[] = Array.isArray(product?.seoUrls) ? product.seoUrls : [];
    const canonical = seoUrls.find((entry) => entry?.isCanonical);
    if (canonical?.url) {
      candidates.push(canonical.url);
    }
    if (canonical?.seoPathInfo) {
      candidates.push(canonical.seoPathInfo);
    }

    for (const entry of seoUrls) {
      if (entry?.url) {
        candidates.push(entry.url);
      }
      if (entry?.seoPathInfo) {
        candidates.push(entry.seoPathInfo);
      }
    }

    if (product?.links?.self) {
      candidates.push(product.links.self);
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue;
      }
      try {
        return new URL(candidate, this.config.baseUrl).toString();
      } catch (error) {
        this.logger.warn?.('[shopware-client] Failed to resolve product URL candidate', {
          candidate,
          error
        });
      }
    }

    return null;
  }

  private resolveMediaUrl(product: any): string | null {
    const mediaCandidates = [
      product?.cover?.url,
      product?.cover?.media?.url,
      product?.media?.[0]?.url
    ];

    for (const candidate of mediaCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        try {
          return new URL(candidate, this.config.baseUrl).toString();
        } catch (error) {
          this.logger.warn?.('[shopware-client] Failed to resolve media URL candidate', {
            candidate,
            error
          });
        }
      }
    }

    return null;
  }

  private normaliseProduct(product: any): ShopwareSearchProduct {
    const id = typeof product?.id === 'string' ? product.id : String(product?.id ?? '');
    const name =
      typeof product?.translated?.name === 'string'
        ? product.translated.name
        : typeof product?.name === 'string'
        ? product.name
        : '';
    const artikelNummer = typeof product?.productNumber === 'string' ? product.productNumber : null;
    const description =
      typeof product?.translated?.description === 'string'
        ? product.translated.description
        : typeof product?.description === 'string'
        ? product.description
        : null;
    const manufacturer =
      typeof product?.manufacturer?.translated?.name === 'string'
        ? product.manufacturer.translated.name
        : typeof product?.manufacturer?.name === 'string'
        ? product.manufacturer.name
        : typeof product?.translated?.manufacturerName === 'string'
        ? product.translated.manufacturerName
        : null;

    const { amount, currency } = determinePriceSource(product);

    const dimensions: ShopwareSearchDimensions = {
      length_mm: normaliseNumber(product?.length),
      width_mm: normaliseNumber(product?.width),
      height_mm: normaliseNumber(product?.height),
      weight_kg: normaliseNumber(product?.weight)
    };

    const url = this.resolveProductUrl(product);
    const mediaUrl = this.resolveMediaUrl(product);

    return {
      id,
      name,
      artikelNummer,
      description,
      manufacturer,
      price: amount,
      currency,
      url,
      mediaUrl,
      dimensions
    };
  }

  async searchProducts(query: string, limit = 5): Promise<ShopwareSearchProduct[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return [];
    }

    const boundedLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 5)));
    const token = await this.getToken();
    const searchUrl = new URL('/store-api/search', this.config.baseUrl);

    this.logger.info?.('[shopware-client] Performing product search', {
      query: trimmed,
      limit: boundedLimit
    });

    let response: Response;
    try {
      response = await this.fetchWithTimeout(searchUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'sw-access-key': this.config.salesChannelKey
        },
        body: JSON.stringify({ search: trimmed, limit: boundedLimit })
      });
    } catch (error) {
      this.logger.error?.('[shopware-client] Search request network failure', error);
      throw error;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      const err = new Error(`Shopware search failed with status ${response.status}: ${text}`);
      this.logger.error?.('[shopware-client] Search request rejected', err);
      throw err;
    }

    const payload = await response.json().catch((error) => {
      this.logger.error?.('[shopware-client] Search response JSON parse failed', error);
      throw error;
    });

    const rawItems: any[] = Array.isArray(payload?.elements)
      ? payload.elements
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    const products = rawItems.slice(0, boundedLimit).map((item) => this.normaliseProduct(item));

    this.logger.info?.('[shopware-client] Product search completed', {
      query: trimmed,
      count: products.length
    });

    return products;
  }
}

export function createShopwareClient(
  config: ShopwareConfiguration,
  options: ShopwareClientOptions = {}
): ShopwareSearchClient {
  return new ShopwareClient(config, options);
}
