import 'dotenv/config';
import { z } from '../utils/zod.js';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // LLM (local via Ollama)
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),

  // add to schema
  SEARCH_BASE_URL: z.string().url().default('http://127.0.0.1'),
  SEARCH_PORT: z.coerce.number().int().positive().default(3000),
  SEARCH_PATH: z.string().default('/search'),
  TAVILY_API_KEY: z.string().min(1).optional(),

  AGENT_API_BASE_URL: z.string().url().optional(),
  AGENT_SHARED_SECRET: z.string().min(1).optional(),

  SHOPWARE_BASE_URL: z.string().url().optional(),
  SHOPWARE_CLIENT_ID: z.string().min(1).optional(),
  SHOPWARE_CLIENT_SECRET: z.string().min(1).optional(),
  SHOPWARE_API_TOKEN: z.string().min(1).optional(),
  SHOPWARE_SALES_CHANNEL: z.string().min(1).optional(),
});

export const cfg = schema.parse(process.env);

const shopwareSchema = z
  .object({
    baseUrl: z.string().url(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    apiToken: z.string().min(1).optional(),
    salesChannel: z.string().min(1),
  })
  .refine(
    (data) => Boolean(data.apiToken) || (Boolean(data.clientId) && Boolean(data.clientSecret)),
    {
      message: 'Provide either SHOPWARE_API_TOKEN or both SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET',
      path: ['apiToken'],
    },
  );

const rawShopwareConfig = {
  baseUrl: cfg.SHOPWARE_BASE_URL,
  clientId: cfg.SHOPWARE_CLIENT_ID,
  clientSecret: cfg.SHOPWARE_CLIENT_SECRET,
  apiToken: cfg.SHOPWARE_API_TOKEN,
  salesChannel: cfg.SHOPWARE_SALES_CHANNEL,
};

export const shopwareConfig = rawShopwareConfig.baseUrl
  ? shopwareSchema.parse(rawShopwareConfig)
  : null;


export const MODEL_PROVIDER = (process.env.MODEL_PROVIDER) || 'ollama';

export const modelConfig = {
  provider: MODEL_PROVIDER,
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || process.env.MODEL_BASE_URL || undefined,
    model: process.env.OLLAMA_MODEL || process.env.MODEL_NAME || undefined,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.MODEL_API_KEY || undefined,
    baseUrl: process.env.OPENAI_BASE_URL || process.env.MODEL_BASE_URL || undefined,
    model: process.env.OPENAI_MODEL || process.env.MODEL_NAME || undefined,
  },
};


export const searchConfig = {
  baseUrl: cfg.SEARCH_BASE_URL,
  port: cfg.SEARCH_PORT,
  path: cfg.SEARCH_PATH,
  tavilyApiKey: cfg.TAVILY_API_KEY,
};

export const callbackConfig = {
  baseUrl: cfg.AGENT_API_BASE_URL,
  sharedSecret: cfg.AGENT_SHARED_SECRET,
};
