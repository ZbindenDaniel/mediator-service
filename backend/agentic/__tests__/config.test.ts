import type { AgenticModelConfig } from '../config';

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
    'AGENTIC_OLLAMA_VISION_MODEL',
    'AGENTIC_OPENAI_VISION_MODEL',
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

  it('prefers AGENTIC_MODEL_PROVIDER over legacy MODEL_PROVIDER', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'openai';
    process.env.MODEL_PROVIDER = 'ollama';

    const { modelConfig } = loadConfig();

    expect(modelConfig.provider).toBe('openai');
  });

  it('prefers the active provider keys over generic MODEL_* keys', () => {
    process.env.AGENTIC_MODEL_PROVIDER = 'openai';
    process.env.MODEL_BASE_URL = 'https://generic.example.com';
    process.env.AGENTIC_OPENAI_BASE_URL = 'https://api.openai.example.com/v1';

    const { modelConfig } = loadConfig();

    expect(modelConfig.baseUrl).toBe('https://api.openai.example.com/v1');
  });

  describe('with both providers configured', () => {
    beforeEach(() => {
      process.env.AGENTIC_OLLAMA_BASE_URL = 'http://ollama.example.com:11434';
      process.env.AGENTIC_OLLAMA_MODEL = 'qwen3:8b';
      process.env.AGENTIC_OLLAMA_VISION_MODEL = 'llava:13b';
      process.env.AGENTIC_OPENAI_BASE_URL = 'https://api.openai.example.com/v1';
      process.env.AGENTIC_OPENAI_MODEL = 'gpt-4o-mini';
      process.env.AGENTIC_OPENAI_VISION_MODEL = 'gpt-4o';
      process.env.AGENTIC_OPENAI_API_KEY = 'openai-key';
    });

    it('uses only the ollama settings when the provider is ollama', () => {
      process.env.AGENTIC_MODEL_PROVIDER = 'ollama';

      const { modelConfig } = loadConfig();

      expect(modelConfig).toMatchObject({
        provider: 'ollama',
        baseUrl: 'http://ollama.example.com:11434',
        textModel: 'qwen3:8b',
        visionModel: 'llava:13b'
      });
      expect(modelConfig.apiKey).toBeUndefined();
    });

    it('uses only the openai settings when the provider is openai', () => {
      process.env.AGENTIC_MODEL_PROVIDER = 'openai';

      const { modelConfig } = loadConfig();

      expect(modelConfig).toMatchObject({
        provider: 'openai',
        baseUrl: 'https://api.openai.example.com/v1',
        textModel: 'gpt-4o-mini',
        visionModel: 'gpt-4o',
        apiKey: 'openai-key'
      });
    });
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

  // Shopware configuration moved to the root backend config (backend/config.ts SHOPWARE_CONFIG);
  // it is no longer resolved by the agentic config module. See test/shopware-connection-check.test.ts
  // and the config-issue helpers in backend/config.ts for its coverage.
});
