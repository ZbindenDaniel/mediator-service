import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  MODEL_PROVIDER: z.enum(['ollama', 'openai']).default('ollama'),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  MODEL_BASE_URL: z.string().url().optional(),
  MODEL_NAME: z.string().min(1).optional(),
  MODEL_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  SEARCH_RATE_LIMIT_DELAY_MS: z.coerce.number().int().nonnegative().optional(),
  AGENT_API_BASE_URL: z.string().url().optional(),
  AGENT_SHARED_SECRET: z.string().min(1).optional(),
  SHOPWARE_BASE_URL: z.string().url().optional(),
  SHOPWARE_CLIENT_ID: z.string().min(1).optional(),
  SHOPWARE_CLIENT_SECRET: z.string().min(1).optional(),
  SHOPWARE_API_TOKEN: z.string().min(1).optional(),
  SHOPWARE_SALES_CHANNEL: z.string().min(1).optional(),
  AGENT_ACTOR_ID: z.string().min(1).optional()
});

type EnvSchemaInput = z.input<typeof envSchema>;

const SECRET_TOKEN_PATTERN = /(KEY|SECRET|TOKEN)$/i;

function resolveEnvValue(...keys: Array<keyof NodeJS.ProcessEnv>): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function sanitizeEnvForLogging(env: EnvSchemaInput): Record<string, unknown> {
  return Object.entries(env).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = SECRET_TOKEN_PATTERN.test(key) && value ? '***redacted***' : value ?? '(unset)';
    return acc;
  }, {});
}

const envInput: EnvSchemaInput = {
  NODE_ENV: resolveEnvValue('NODE_ENV'),
  MODEL_PROVIDER: resolveEnvValue('AGENTIC_MODEL_PROVIDER', 'MODEL_PROVIDER'),
  OLLAMA_BASE_URL: resolveEnvValue('AGENTIC_OLLAMA_BASE_URL', 'OLLAMA_BASE_URL'),
  OLLAMA_MODEL: resolveEnvValue('AGENTIC_OLLAMA_MODEL', 'OLLAMA_MODEL'),
  OPENAI_API_KEY: resolveEnvValue('AGENTIC_OPENAI_API_KEY', 'OPENAI_API_KEY'),
  OPENAI_BASE_URL: resolveEnvValue('AGENTIC_OPENAI_BASE_URL', 'OPENAI_BASE_URL'),
  OPENAI_MODEL: resolveEnvValue('AGENTIC_OPENAI_MODEL', 'OPENAI_MODEL'),
  MODEL_BASE_URL: resolveEnvValue('AGENTIC_MODEL_BASE_URL', 'MODEL_BASE_URL'),
  MODEL_NAME: resolveEnvValue('AGENTIC_MODEL_NAME', 'MODEL_NAME'),
  MODEL_API_KEY: resolveEnvValue('AGENTIC_MODEL_API_KEY', 'MODEL_API_KEY'),
  TAVILY_API_KEY: resolveEnvValue('TAVILY_API_KEY'),
  SEARCH_RATE_LIMIT_DELAY_MS: resolveEnvValue('SEARCH_RATE_LIMIT_DELAY_MS'),
  AGENT_API_BASE_URL: resolveEnvValue('AGENTIC_AGENT_API_BASE_URL', 'AGENT_API_BASE_URL'),
  AGENT_SHARED_SECRET: resolveEnvValue('AGENTIC_AGENT_SHARED_SECRET', 'AGENT_SHARED_SECRET'),
  SHOPWARE_BASE_URL: resolveEnvValue('SHOPWARE_BASE_URL'),
  SHOPWARE_CLIENT_ID: resolveEnvValue('SHOPWARE_CLIENT_ID'),
  SHOPWARE_CLIENT_SECRET: resolveEnvValue('SHOPWARE_CLIENT_SECRET'),
  SHOPWARE_API_TOKEN: resolveEnvValue('SHOPWARE_API_TOKEN'),
  SHOPWARE_SALES_CHANNEL: resolveEnvValue('SHOPWARE_SALES_CHANNEL', 'SHOPWARE_SALES_CHANNEL_ID'),
  AGENT_ACTOR_ID: resolveEnvValue('AGENT_ACTOR_ID')
};

function parseEnvConfig(): z.infer<typeof envSchema> {
  try {
    return envSchema.parse(envInput);
  } catch (err) {
    console.error?.({
      msg: 'Failed to parse agentic environment configuration',
      envKeys: sanitizeEnvForLogging(envInput),
      err
    });
    throw err;
  }
}

const parsedEnv = parseEnvConfig();

export type AgenticModelProvider = z.infer<typeof envSchema>['MODEL_PROVIDER'];

export interface OllamaModelConfig {
  baseUrl?: string;
  model?: string;
}

export interface OpenAIModelConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AgenticModelConfig {
  provider: AgenticModelProvider;
  ollama: OllamaModelConfig;
  openai: OpenAIModelConfig;
}

export interface AgenticSearchConfig {
  tavilyApiKey?: string;
  rateLimitDelayMs?: number;
}

export interface AgenticCallbackConfig {
  baseUrl?: string;
  sharedSecret?: string;
}

export interface ShopwareCredentialsConfig {
  clientId?: string;
  clientSecret?: string;
  apiToken?: string;
}

export interface ShopwareIntegrationConfig extends ShopwareCredentialsConfig {
  baseUrl: string;
  salesChannel: string;
}

const resolvedModelBaseUrl = parsedEnv.OLLAMA_BASE_URL ?? parsedEnv.MODEL_BASE_URL;
const resolvedModelName = parsedEnv.OLLAMA_MODEL ?? parsedEnv.MODEL_NAME;
const resolvedOpenAiBaseUrl = parsedEnv.OPENAI_BASE_URL ?? parsedEnv.MODEL_BASE_URL;
const resolvedOpenAiModel = parsedEnv.OPENAI_MODEL ?? parsedEnv.MODEL_NAME;
const resolvedOpenAiKey = parsedEnv.OPENAI_API_KEY ?? parsedEnv.MODEL_API_KEY;

export const modelConfig: AgenticModelConfig = {
  provider: parsedEnv.MODEL_PROVIDER,
  ollama: {
    baseUrl: resolvedModelBaseUrl,
    model: resolvedModelName
  },
  openai: {
    apiKey: resolvedOpenAiKey,
    baseUrl: resolvedOpenAiBaseUrl,
    model: resolvedOpenAiModel
  }
};

export const searchConfig: AgenticSearchConfig = {
  tavilyApiKey: parsedEnv.TAVILY_API_KEY,
  rateLimitDelayMs: parsedEnv.SEARCH_RATE_LIMIT_DELAY_MS
};

export const callbackConfig: AgenticCallbackConfig = {
  baseUrl: parsedEnv.AGENT_API_BASE_URL?.trim() || undefined,
  sharedSecret: parsedEnv.AGENT_SHARED_SECRET?.trim() || undefined
};

const shopwareConfigSchema = z
  .object({
    baseUrl: z.string().url(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    apiToken: z.string().min(1).optional(),
    salesChannel: z.string().min(1)
  })
  .refine(
    (data) => Boolean(data.apiToken) || (Boolean(data.clientId) && Boolean(data.clientSecret)),
    {
      message: 'Provide either SHOPWARE_API_TOKEN or both SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET',
      path: ['apiToken']
    }
  );

const rawShopwareConfig = {
  baseUrl: parsedEnv.SHOPWARE_BASE_URL,
  clientId: parsedEnv.SHOPWARE_CLIENT_ID,
  clientSecret: parsedEnv.SHOPWARE_CLIENT_SECRET,
  apiToken: parsedEnv.SHOPWARE_API_TOKEN,
  salesChannel: parsedEnv.SHOPWARE_SALES_CHANNEL
};

export const shopwareConfig: ShopwareIntegrationConfig | null = rawShopwareConfig.baseUrl
  ? shopwareConfigSchema.parse(rawShopwareConfig)
  : null;

export const agentActorId: string = parsedEnv.AGENT_ACTOR_ID?.trim() || 'item-flow-service';

export const nodeEnv = parsedEnv.NODE_ENV;
