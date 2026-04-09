import type { AgenticModelConfig, ShopwareIntegrationConfig } from '../config';

describe('agentic config environment resolution', () => {
  const baselineEnv = { ...process.env };
  const managedKeys = [
    'AGENTIC_MODEL_PROVIDER',
    'MODEL_PROVIDER',
    'MODEL_BASE_URL',
    'AGENTIC_MODEL_BASE_URL',
    'AGENTIC_OLLAMA_BASE_URL',
    'OLLAMA_BASE_URL',
    'AGENTIC_OPENAI_BASE_URL',
    'OPENAI_BASE_URL',
    'MODEL_NAME',
    'AGENTIC_MODEL_NAME',
    'AGENTIC_OLLAMA_MODEL',
    'OLLAMA_MODEL',
    'AGENTIC_OPENAI_MODEL',
    'OPENAI_MODEL',
    'MODEL_API_KEY',
    'AGENTIC_MODEL_API_KEY',
    'AGENTIC_OPENAI_API_KEY',
    'OPENAI_API_KEY',
    'VISION_MODEL_NAME',
    'SHOPWARE_BASE_URL',
    'SHOPWARE_CLIENT_ID',
    'SHOPWARE_CLIENT_SECRET',
    'SHOPWARE_API_TOKEN',
    'SHOPWARE_ACCESS_TOKEN',
    'SHOPWARE_SALES_CHANNEL',
    'SHOPWARE_SALES_CHANNEL_ID',
    'SEARCH_MAX_AGENT_QUERIES_PER_REQUEST'
  ];

  const loadConfig = () => {
    let exports: typeof import('../config');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      exports = require('../config');
    });
    return exports!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...baselineEnv };
    for (const key of managedKeys) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = baselineEnv;
  });

  it('loads prefixed AGENTIC_OLLAMA_* keys into flat modelConfig', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'ollama';
    process.env.AGENTIC_OLLAMA_BASE_URL = 'http://ollama-pref.example.com';
    process.env.AGENTIC_OLLAMA_MODEL = 'llama3';

    const { modelConfig } = loadConfig();

    expect(modelConfig.provider).toBe('ollama');
    expect(modelConfig.baseUrl).toBe('http://ollama-pref.example.com');
    expect(modelConfig.textModel).toBe('llama3');
  });

  it('falls back to legacy OPENAI_* keys', () => {
    process.env.MODEL_PROVIDER = 'openai';
    process.env.OPENAI_BASE_URL = 'https://legacy.openai.example.com';
    process.env.OPENAI_MODEL = 'gpt-3.5-turbo';
    process.env.OPENAI_API_KEY = 'legacy-key';

    const { modelConfig } = loadConfig();

    expect(modelConfig.provider).toBe('openai');
    expect(modelConfig.baseUrl).toBe('https://legacy.openai.example.com');
    expect(modelConfig.textModel).toBe('gpt-3.5-turbo');
    expect(modelConfig.apiKey).toBe('legacy-key');
  });

  it('prefers canonical MODEL_* keys over legacy aliases when both are set', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'openai';
    process.env.MODEL_PROVIDER = 'ollama';
    process.env.MODEL_BASE_URL = 'https://new.example.com';
    process.env.OPENAI_BASE_URL = 'https://old.example.com';

    const { modelConfig } = loadConfig();

    expect(modelConfig.provider).toBe('openai');
    expect(modelConfig.baseUrl).toBe('https://new.example.com');
  });

  it('resolves AGENTIC_MODEL_BASE_URL and AGENTIC_MODEL_NAME as shared fallbacks', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'ollama';
    process.env.AGENTIC_MODEL_BASE_URL = 'http://generic-base.example.com';
    process.env.AGENTIC_MODEL_NAME = 'generic-model';

    const { modelConfig } = loadConfig();

    expect(modelConfig.baseUrl).toBe('http://generic-base.example.com');
    expect(modelConfig.textModel).toBe('generic-model');
  });

  it('reads VISION_MODEL_NAME into modelConfig.visionModel', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'ollama';
    process.env.VISION_MODEL_NAME = 'llava:13b';

    const { modelConfig } = loadConfig();

    expect(modelConfig.visionModel).toBe('llava:13b');
  });

  it('leaves visionModel undefined when VISION_MODEL_NAME is absent', () => {
    const { modelConfig } = loadConfig();

    expect(modelConfig.visionModel).toBeUndefined();
  });

  it('defaults provider to ollama when neither key is provided', () => {
    const { modelConfig } = loadConfig();

    expect((modelConfig as AgenticModelConfig).provider).toBe('ollama');
  });

  it('defaults SEARCH_MAX_AGENT_QUERIES_PER_REQUEST to 3 when unset', () => {
    const { searchLimits } = loadConfig();

    expect(searchLimits.maxAgentQueriesPerRequest).toBe(3);
  });

  it('throws a descriptive error when the provider value is invalid', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'claude';

    expect(() => loadConfig()).toThrowError(/Unsupported value/);
  });

  describe('shopware configuration', () => {
    it('accepts SHOPWARE_ACCESS_TOKEN and trims surrounding whitespace', () => {
      process.env.SHOPWARE_BASE_URL = ' https://shopware.example.com ';
      process.env.SHOPWARE_SALES_CHANNEL = ' main-channel ';
      process.env.SHOPWARE_ACCESS_TOKEN = '  token-value  ';

      const { shopwareConfig } = loadConfig();

      expect(shopwareConfig).not.toBeNull();
      expect((shopwareConfig as ShopwareIntegrationConfig).baseUrl).toBe(
        'https://shopware.example.com'
      );
      expect((shopwareConfig as ShopwareIntegrationConfig).salesChannel).toBe('main-channel');
      expect((shopwareConfig as ShopwareIntegrationConfig).apiToken).toBe('token-value');
    });

    it('skips configuration when required values resolve to empty strings', () => {
      process.env.SHOPWARE_BASE_URL = 'https://shopware.example.com';
      process.env.SHOPWARE_SALES_CHANNEL_ID = '   ';
      process.env.SHOPWARE_CLIENT_ID = 'client-id';
      process.env.SHOPWARE_CLIENT_SECRET = '   ';

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      try {
        const { shopwareConfig } = loadConfig();

        expect(shopwareConfig).toBeNull();
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.objectContaining({ msg: 'Skipping Shopware configuration due to incomplete settings' })
        );
      } finally {
        consoleInfoSpy.mockRestore();
      }
    });
  });
});
