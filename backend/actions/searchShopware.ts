// TODO: Implement this as an action. This has been copied from another service and has now to be adapted. Refactor to the usually used action patterns. refactor to Typecript
// TODO: this is an extension to the 'search' action. It gets called when a new item is attempted to be added to the inventory. It searches the shopware instance for product data matching the item description. The found data is then used to enrich the item data before adding it to the inventory.

// import { z } from '../utils/zod.js';
// import { shopwareConfig } from '../config/index.js';
// import { logger } from '../utils/logger.js';

// const PRODUCT_LIMIT_MAX = 25;
// let cachedToken = null;
// let cachedTokenExpiry = 0;
// let cachedTokenSignature = null;

// let DynamicStructuredToolClass;
// try {
//   ({ DynamicStructuredTool: DynamicStructuredToolClass } = await import('@langchain/core/tools'));
// } catch (err) {
//   logger.warn({ err, msg: 'DynamicStructuredTool unavailable - Shopware tool export disabled' });
// }

// const SHOPWARE_CONFIG_OVERRIDE_KEY = Symbol.for('ai-flow-service.shopwareConfigOverride');

// function getActiveShopwareConfig() {
//   if (Object.prototype.hasOwnProperty.call(globalThis, SHOPWARE_CONFIG_OVERRIDE_KEY)) {
//     return globalThis[SHOPWARE_CONFIG_OVERRIDE_KEY];
//   }
//   return shopwareConfig;
// }

// export function isShopwareConfigured() {
//   return Boolean(getActiveShopwareConfig());
// }

// export function __setShopwareConfigOverride(config) {
//   globalThis[SHOPWARE_CONFIG_OVERRIDE_KEY] = config;
// }

// export function __clearShopwareConfigOverride() {
//   delete globalThis[SHOPWARE_CONFIG_OVERRIDE_KEY];
// }

// function resolveProductUrl(product, baseUrl) {
//   const candidates = [];
//   if (typeof product.url === 'string') {
//     candidates.push(product.url);
//   }
//   const seoUrls = Array.isArray(product?.seoUrls) ? product.seoUrls : [];
//   const canonical = seoUrls.find((entry) => entry?.isCanonical);
//   if (canonical?.url) {
//     candidates.push(canonical.url);
//   }
//   if (canonical?.seoPathInfo) {
//     candidates.push(canonical.seoPathInfo);
//   }
//   seoUrls.forEach((entry) => {
//     if (entry?.url) {
//       candidates.push(entry.url);
//     }
//     if (entry?.seoPathInfo) {
//       candidates.push(entry.seoPathInfo);
//     }
//   });
//   if (product?.links?.self) {
//     candidates.push(product.links.self);
//   }

//   for (const candidate of candidates) {
//     try {
//       if (typeof candidate === 'string' && candidate.trim()) {
//         return new URL(candidate, baseUrl).toString();
//       }
//     } catch (err) {
//       logger.debug({ err, msg: 'shopware url resolution failed', candidate });
//     }
//   }

//   return null;
// }

// function normaliseNumber(value) {
//   if (value === null || value === undefined) {
//     return null;
//   }
//   const num = Number(value);
//   return Number.isFinite(num) ? num : null;
// }

// function mapProduct(product, baseUrl) {
//   const id = product?.id ?? '';
//   const name = product?.translated?.name || product?.name || '';
//   const manufacturer =
//     product?.manufacturer?.translated?.name || product?.manufacturer?.name || product?.translated?.manufacturerName || '';

//   const priceSource = product?.calculatedPrice ?? product?.price?.[0] ?? {};
//   const price = normaliseNumber(priceSource?.totalPrice ?? priceSource?.gross ?? priceSource?.unitPrice);
//   const currency =
//     priceSource?.currency ||
//     priceSource?.currencyId ||
//     priceSource?.currencyIsoCode ||
//     priceSource?.price?.currencyIsoCode ||
//     null;

//   const dimensions = {
//     length_mm: normaliseNumber(product?.length),
//     width_mm: normaliseNumber(product?.width),
//     height_mm: normaliseNumber(product?.height),
//     weight_kg: normaliseNumber(product?.weight),
//   };

//   const url = resolveProductUrl(product, baseUrl);

//   return {
//     id,
//     name,
//     url,
//     manufacturer: manufacturer || null,
//     price,
//     currency,
//     dimensions,
//   };
// }

// async function getShopwareToken() {
//   const activeConfig = getActiveShopwareConfig();
//   if (!activeConfig) {
//     throw new Error('Shopware configuration is missing');
//   }
//   if (activeConfig.apiToken) {
//     return activeConfig.apiToken;
//   }
//   const now = Date.now();
//   const signature = JSON.stringify({
//     baseUrl: activeConfig.baseUrl,
//     clientId: activeConfig.clientId,
//     clientSecret: activeConfig.clientSecret,
//     salesChannel: activeConfig.salesChannel,
//   });
//   if (cachedTokenSignature !== signature) {
//     cachedToken = null;
//     cachedTokenExpiry = 0;
//     cachedTokenSignature = signature;
//   }
//   if (cachedToken && cachedTokenExpiry > now) {
//     return cachedToken;
//   }

//   const tokenUrl = new URL('/api/oauth/token', activeConfig.baseUrl);
//   const body = new URLSearchParams({
//     grant_type: 'client_credentials',
//     client_id: activeConfig.clientId,
//     client_secret: activeConfig.clientSecret,
//   });

//   try {
//     logger.debug({ msg: 'requesting shopware oauth token' });
//     const response = await fetch(tokenUrl, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body,
//     });

//     if (!response.ok) {
//       const text = await response.text();
//       throw new Error(`Shopware token request failed with status ${response.status}: ${text}`);
//     }

//     const data = await response.json();
//     const token = data?.access_token;
//     const expiresIn = Number(data?.expires_in ?? 0);
//     if (!token) {
//       throw new Error('Shopware token response missing access_token');
//     }
//     cachedToken = token;
//     cachedTokenExpiry = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 5 * 60 * 1000);
//     logger.info({ msg: 'shopware token acquired' });
//     return token;
//   } catch (err) {
//     logger.error({ err, msg: 'shopware token fetch failed' });
//     throw err;
//   }
// }

// export async function searchShopwareRaw(query, limit = 5) {
//   const activeConfig = getActiveShopwareConfig();
//   if (!activeConfig) {
//     logger.warn({ msg: 'shopware search skipped - configuration not provided' });
//     return { text: 'Shopware search unavailable: configuration missing.', products: [] };
//   }

//   const boundedLimit = Math.min(Math.max(1, limit), PRODUCT_LIMIT_MAX);

//   try {
//     const token = await getShopwareToken();
//     const searchUrl = new URL('/store-api/search', activeConfig.baseUrl);
//     const response = await fetch(searchUrl, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Authorization: `Bearer ${token}`,
//         'sw-access-key': activeConfig.salesChannel,
//       },
//       body: JSON.stringify({ search: query, limit: boundedLimit }),
//     });

//     if (!response.ok) {
//       const text = await response.text();
//       throw new Error(`Shopware search failed with status ${response.status}: ${text}`);
//     }

//     const payload = await response.json();
//     const items = Array.isArray(payload?.elements)
//       ? payload.elements
//       : Array.isArray(payload?.data)
//       ? payload.data
//       : [];

//     if (!items.length) {
//       logger.info({ msg: 'shopware search completed - no products found', query });
//       return { text: `No Shopware products found for "${query}".`, products: [] };
//     }

//     const products = items.slice(0, boundedLimit).map((product) => mapProduct(product, activeConfig.baseUrl));
//     const lines = products.map((product, index) => {
//       const parts = [
//         `${index + 1}. ${product.name || '(no name)'}`,
//         product.url ? product.url : null,
//         product.manufacturer ? `Manufacturer: ${product.manufacturer}` : null,
//         product.price != null ? `Price: ${product.price}${product.currency ? ` ${product.currency}` : ''}` : null,
//       ].filter(Boolean);
//       return parts.join(' | ');
//     });

//     const text = `SHOPWARE RESULTS for "${query}":\n${lines.join('\n')}`;
//     logger.info({ msg: 'shopware search completed', query, productCount: products.length });
//     return { text, products };
//   } catch (err) {
//     logger.error({ err, msg: 'shopware search failed', query });
//     throw err;
//   }
// }

// export const searchShopware = DynamicStructuredToolClass
//   ? new DynamicStructuredToolClass({
//       name: 'searchShopware',
//       description: 'Searches products via the configured Shopware Store API.',
//       schema: z.object({
//         query: z.string(),
//         limit: z.number().int().min(1).max(PRODUCT_LIMIT_MAX).default(5),
//       }),
//       func: async ({ query, limit }) => {
//         try {
//           const result = await searchShopwareRaw(query, limit);
//           return JSON.stringify(result, null, 2);
//         } catch (err) {
//           logger.error({ err, msg: 'searchShopware tool invocation failed' });
//           throw err;
//         }
//       },
//     })
//   : null;
