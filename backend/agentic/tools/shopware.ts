import { shopwareConfig } from '../config';
import type { TavilySearchLogger } from './tavily-client';

const PRODUCT_LIMIT_MAX = 25;
let cachedToken: string | null = null;
let cachedTokenExpiry = 0;
let cachedTokenSignature: string | null = null;

let shopwareConfigOverride: typeof shopwareConfig | null | undefined;

export interface ShopwareToolLogger extends TavilySearchLogger {}

export type ShopwareProductEntry = Record<string, unknown> & {
  id?: string;
  url?: string;
  name?: string;
};

export interface ShopwareSearchResult {
  text: string;
  products: ShopwareProductEntry[];
}

function getActiveShopwareConfig() {
  if (shopwareConfigOverride !== undefined) {
    return shopwareConfigOverride;
  }
  return shopwareConfig;
}

export function isShopwareConfigured(): boolean {
  return Boolean(getActiveShopwareConfig());
}

export function __setShopwareConfigOverride(config: typeof shopwareConfig | null): void {
  shopwareConfigOverride = config;
  cachedToken = null;
  cachedTokenExpiry = 0;
  cachedTokenSignature = null;
}

export function __clearShopwareConfigOverride(): void {
  shopwareConfigOverride = undefined;
  cachedToken = null;
  cachedTokenExpiry = 0;
  cachedTokenSignature = null;
}

function resolveProductUrl(product: Record<string, unknown>, baseUrl: string): string | null {
  const candidates: Array<unknown> = [];
  if (typeof product.url === 'string') {
    candidates.push(product.url);
  }
  const seoUrls = Array.isArray(product.seoUrls) ? product.seoUrls : [];
  const canonical = seoUrls.find((entry) => (entry as { isCanonical?: boolean })?.isCanonical);
  if (canonical && typeof (canonical as { url?: string }).url === 'string') {
    candidates.push((canonical as { url?: string }).url);
  }
  if (canonical && typeof (canonical as { seoPathInfo?: string }).seoPathInfo === 'string') {
    candidates.push((canonical as { seoPathInfo?: string }).seoPathInfo);
  }
  seoUrls.forEach((entry) => {
    if (entry && typeof entry === 'object') {
      const url = (entry as { url?: string }).url;
      if (typeof url === 'string') {
        candidates.push(url);
      }
      const seoPathInfo = (entry as { seoPathInfo?: string }).seoPathInfo;
      if (typeof seoPathInfo === 'string') {
        candidates.push(seoPathInfo);
      }
    }
  });
  if (product && typeof product === 'object' && typeof (product as { links?: { self?: string } }).links?.self === 'string') {
    candidates.push((product as { links?: { self?: string } }).links?.self);
  }

  for (const candidate of candidates) {
    try {
      if (typeof candidate === 'string' && candidate.trim()) {
        return new URL(candidate, baseUrl).toString();
      }
    } catch (err) {
      // ignore invalid candidates
    }
  }

  return null;
}

function normaliseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapProduct(product: Record<string, unknown>, baseUrl: string): ShopwareProductEntry {
  const id = (product.id as string) ?? '';
  const translated = (product.translated as Record<string, unknown>) ?? {};
  const name = (translated.name as string) || (product.name as string) || '';
  const manufacturer =
    ((product.manufacturer as Record<string, unknown>)?.translated as Record<string, unknown>)?.name ||
    (product.manufacturer as Record<string, unknown>)?.name ||
    (translated.manufacturerName as string) ||
    '';

  const priceSource =
    (product.calculatedPrice as Record<string, unknown>) ??
    (Array.isArray(product.price) ? (product.price[0] as Record<string, unknown>) : undefined) ??
    {};
  const price = normaliseNumber(priceSource?.totalPrice ?? priceSource?.gross ?? priceSource?.unitPrice);
  const currency =
    (priceSource?.currency as string) ||
    (priceSource?.currencyId as string) ||
    (priceSource?.currencyIsoCode as string) ||
    ((priceSource?.price as Record<string, unknown>)?.currencyIsoCode as string) ||
    null;

  const dimensions = {
    length_mm: normaliseNumber(product.length),
    width_mm: normaliseNumber(product.width),
    height_mm: normaliseNumber(product.height),
    weight_kg: normaliseNumber(product.weight)
  };

  const url = resolveProductUrl(product, baseUrl) ?? undefined;

  return {
    id,
    name,
    url,
    manufacturer: manufacturer || null,
    price,
    currency,
    dimensions
  };
}

async function getShopwareToken(logger?: ShopwareToolLogger): Promise<string> {
  const activeConfig = getActiveShopwareConfig();
  if (!activeConfig) {
    throw new Error('Shopware configuration is missing');
  }
  if (activeConfig.apiToken) {
    return activeConfig.apiToken;
  }
  const now = Date.now();
  const signature = JSON.stringify({
    baseUrl: activeConfig.baseUrl,
    clientId: activeConfig.clientId,
    clientSecret: activeConfig.clientSecret,
    salesChannel: activeConfig.salesChannel
  });
  if (cachedTokenSignature !== signature) {
    cachedToken = null;
    cachedTokenExpiry = 0;
    cachedTokenSignature = signature;
  }
  if (cachedToken && cachedTokenExpiry > now) {
    return cachedToken;
  }

  const tokenUrl = new URL('/api/oauth/token', activeConfig.baseUrl);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: activeConfig.clientId ?? '',
    client_secret: activeConfig.clientSecret ?? ''
  });

  try {
    logger?.debug?.({ msg: 'requesting shopware oauth token' });
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopware token request failed with status ${response.status}: ${text}`);
    }

    const data = await response.json();
    const token = (data as { access_token?: string }).access_token;
    const expiresIn = Number((data as { expires_in?: number }).expires_in ?? 0);
    if (!token) {
      throw new Error('Shopware token response missing access_token');
    }
    cachedToken = token;
    cachedTokenExpiry = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 5 * 60 * 1000);
    logger?.info?.({ msg: 'shopware token acquired' });
    return token;
  } catch (err) {
    logger?.error?.({ err, msg: 'shopware token fetch failed' });
    throw err;
  }
}

export async function searchShopwareRaw(query: string, limit = 5, logger?: ShopwareToolLogger): Promise<ShopwareSearchResult> {
  const activeConfig = getActiveShopwareConfig();
  if (!activeConfig) {
    logger?.warn?.({ msg: 'shopware search skipped - configuration not provided' });
    return { text: 'Shopware search unavailable: configuration missing.', products: [] };
  }

  const boundedLimit = Math.min(Math.max(1, limit), PRODUCT_LIMIT_MAX);

  try {
    const token = await getShopwareToken(logger);
    const searchUrl = new URL('/store-api/search', activeConfig.baseUrl);
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'sw-access-key': activeConfig.salesChannel
      },
      body: JSON.stringify({ search: query, limit: boundedLimit })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopware search failed with status ${response.status}: ${text}`);
    }

    const payload = await response.json();
    const items = Array.isArray((payload as { elements?: unknown[] }).elements)
      ? ((payload as { elements?: unknown[] }).elements as Array<Record<string, unknown>>)
      : Array.isArray((payload as { data?: unknown[] }).data)
        ? ((payload as { data?: unknown[] }).data as Array<Record<string, unknown>>)
        : [];

    if (!items.length) {
      logger?.info?.({ msg: 'shopware search completed - no products found', query });
      return { text: `No Shopware products found for "${query}".`, products: [] };
    }

    const products = items.slice(0, boundedLimit).map((product) => mapProduct(product, activeConfig.baseUrl));
    const lines = products.map((product, index) => {
      const parts = [
        `${index + 1}. ${product.name || '(no name)'}`,
        product.url ? product.url : null,
        product.manufacturer ? `Manufacturer: ${product.manufacturer}` : null,
        product.price != null ? `Price: ${product.price}${product.currency ? ` ${product.currency}` : ''}` : null
      ].filter(Boolean);
      return parts.join(' | ');
    });

    const text = `SHOPWARE RESULTS for "${query}":\n${lines.join('\n')}`;
    logger?.info?.({ msg: 'shopware search completed', query, productCount: products.length });
    return { text, products };
  } catch (err) {
    logger?.error?.({ err, msg: 'shopware search failed', query });
    throw err;
  }
}

export const PRODUCT_LIMIT = PRODUCT_LIMIT_MAX;
