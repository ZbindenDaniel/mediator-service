import assert from 'node:assert/strict';

async function importSearchShopware() {
  return import(`../tools/searchShopware.js?test=${Date.now()}`);
}

function buildProductResponse() {
  return {
    elements: [
      {
        id: 'prod-1',
        translated: { name: 'Premium Widget' },
        manufacturer: { name: 'ACME Corp' },
        calculatedPrice: { totalPrice: 199.99, currency: 'EUR' },
        length: 120,
        width: 50,
        height: 25,
        weight: 2.4,
        seoUrls: [
          { isCanonical: true, seoPathInfo: '/premium-widget' },
        ],
      },
    ],
  };
}

export async function runSearchShopwareTests() {
  const originalEnv = {
    baseUrl: process.env.SHOPWARE_BASE_URL,
    apiToken: process.env.SHOPWARE_API_TOKEN,
    salesChannel: process.env.SHOPWARE_SALES_CHANNEL,
    ollamaBase: process.env.OLLAMA_BASE_URL,
    ollamaModel: process.env.OLLAMA_MODEL,
  };
  const originalFetch = global.fetch;

  process.env.SHOPWARE_BASE_URL = 'https://shop.example';
  process.env.SHOPWARE_API_TOKEN = 'token-123';
  process.env.SHOPWARE_SALES_CHANNEL = 'sales-channel-1';
  process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'test-model';

  try {
    const shopwareModule = await importSearchShopware();
    const { searchShopwareRaw, __setShopwareConfigOverride, __clearShopwareConfigOverride } = shopwareModule;

    __setShopwareConfigOverride({
      baseUrl: process.env.SHOPWARE_BASE_URL,
      apiToken: process.env.SHOPWARE_API_TOKEN,
      salesChannel: process.env.SHOPWARE_SALES_CHANNEL,
    });

    global.fetch = async () => ({
      ok: true,
      json: async () => buildProductResponse(),
    });

    const result = await searchShopwareRaw('Premium Widget', 3);
    assert.equal(result.products.length, 1, 'expected a product');
    const [product] = result.products;
    assert.equal(product.id, 'prod-1');
    assert.equal(product.name, 'Premium Widget');
    assert.equal(product.manufacturer, 'ACME Corp');
    assert.equal(product.dimensions.length_mm, 120);
    assert.equal(product.price, 199.99);
    assert.ok(result.text.includes('Premium Widget'));

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ elements: [] }),
    });

    const noMatch = await searchShopwareRaw('Unknown', 2);
    assert.equal(noMatch.products.length, 0, 'expected no products');
    assert.ok(noMatch.text.includes('No Shopware products'));

    global.fetch = async () => {
      throw new Error('network error');
    };

    let threw = false;
    try {
      await searchShopwareRaw('Failure case', 1);
    } catch (err) {
      threw = true;
      assert.equal(err.message, 'network error');
    }
    assert.ok(threw, 'expected error to be thrown');

    __clearShopwareConfigOverride();

    const shopwareModuleNoConfig = await importSearchShopware();
    const {
      searchShopwareRaw: searchShopwareNoConfig,
      __setShopwareConfigOverride: setOverride,
      __clearShopwareConfigOverride: clearOverride,
    } = shopwareModuleNoConfig;
    setOverride(null);
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called when config missing');
    };

    const skipped = await searchShopwareNoConfig('Skip this', 2);
    assert.equal(skipped.products.length, 0, 'expected no products when config missing');
    assert.ok(skipped.text.includes('Shopware search unavailable'));
    assert.equal(fetchCalled, false, 'fetch should not be called without config');
    clearOverride();
  } finally {
    if (originalEnv.baseUrl === undefined) {
      delete process.env.SHOPWARE_BASE_URL;
    } else {
      process.env.SHOPWARE_BASE_URL = originalEnv.baseUrl;
    }
    if (originalEnv.apiToken === undefined) {
      delete process.env.SHOPWARE_API_TOKEN;
    } else {
      process.env.SHOPWARE_API_TOKEN = originalEnv.apiToken;
    }
    if (originalEnv.salesChannel === undefined) {
      delete process.env.SHOPWARE_SALES_CHANNEL;
    } else {
      process.env.SHOPWARE_SALES_CHANNEL = originalEnv.salesChannel;
    }
    if (originalEnv.ollamaBase === undefined) {
      delete process.env.OLLAMA_BASE_URL;
    } else {
      process.env.OLLAMA_BASE_URL = originalEnv.ollamaBase;
    }
    if (originalEnv.ollamaModel === undefined) {
      delete process.env.OLLAMA_MODEL;
    } else {
      process.env.OLLAMA_MODEL = originalEnv.ollamaModel;
    }
    global.fetch = originalFetch;
  }
}
