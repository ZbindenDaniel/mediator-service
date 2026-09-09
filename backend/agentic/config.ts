import { z } from 'zod';

const MODEL_PROVIDER_VALUES = ['ollama', 'openai'] as const;

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  MODEL_PROVIDER: z.enum(MODEL_PROVIDER_VALUES).default('ollama'),
  MODEL_BASE_URL: z.string().url().optional(),
  MODEL_API_KEY: z.string().min(1).optional(),
  MODEL_NAME: z.string().min(1).optional(),
  VISION_MODEL_NAME: z.string().min(1).optional(),
  // Ollama context window (num_ctx, tokens). Ollama defaults to 2048, far below the extraction prompt
  // (~6–7k tokens), so the prompt is silently left-truncated and the model returns an empty completion —
  // the root cause of the "json match missing" / EXTRACTION_FAILED loop. Size to cover prompt + output;
  // raising it costs VRAM, so it stays configurable. Applies to Ollama only.
  MODEL_NUM_CTX: z.coerce.number().int().positive().optional(),
  // Force the Ollama response into valid JSON (Ollama `format: "json"`). Strong guard against empty /
  // prose completions, but it suppresses a reasoning model's <think> phase — default OFF because the
  // extraction path handles <think> blocks. Enable only for non-reasoning models.
  MODEL_FORMAT_JSON: z.string().optional(),
  // Raise undici's fetch header/body timeouts for the (local) model endpoint: a slow first token from a
  // cold Ollama model is a legitimate long wait, not a transport failure. 0 disables the timeout.
  MODEL_HTTP_HEADERS_TIMEOUT_MS: z.coerce.number().int().nonnegative().optional(),
  MODEL_HTTP_BODY_TIMEOUT_MS: z.coerce.number().int().nonnegative().optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  SEARCH_RATE_LIMIT_DELAY_MS: z.coerce.number().int().nonnegative().optional(),
  SEARCH_MAX_PLANS: z.coerce.number().int().min(1).optional(),
  SEARCH_MAX_AGENT_QUERIES_PER_REQUEST: z.coerce.number().int().min(1).optional(),
  // Shopware config now lives in the root backend config (backend/config.ts SHOPWARE_CONFIG),
  // shared by the search action, the admin surface, and the agentic tool.
  AGENT_ACTOR_ID: z.string().min(1).optional()
});

type EnvSchemaInput = z.input<typeof envSchema>;

const SECRET_TOKEN_PATTERN = /(KEY|SECRET|TOKEN)$/i;

function resolveEnvValue(...keys: Array<keyof NodeJS.ProcessEnv>): string | undefined {
  for (const key of keys) {
    const rawValue = process.env[key];
    if (rawValue === undefined) {
      continue;
    }

    const normalizedValue = rawValue.trim();
    if (normalizedValue.length === 0) {
      continue;
    }

    return normalizedValue;
  }
  return undefined;
}

function resolveEnumValue<T extends readonly [string, ...string[]]>(
  allowedValues: T,
  ...keys: Array<keyof NodeJS.ProcessEnv>
): T[number] | undefined {
  const rawValue = resolveEnvValue(...keys);
  if (rawValue === undefined) {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  if ((allowedValues as ReadonlyArray<string>).includes(normalizedValue)) {
    return normalizedValue as T[number];
  }

  const targetKey = keys[0] ?? '(unknown)';
  console.error?.({
    msg: 'Unsupported value for environment variable',
    keys,
    allowedValues,
    rawValue,
    targetKey
  });

  throw new Error(`Unsupported value "${rawValue}" for environment variable ${targetKey}`);
}

function resolveNumber(...keys: Array<keyof NodeJS.ProcessEnv>): number | undefined {
  const rawValue = resolveEnvValue(...keys);
  if (rawValue === undefined) {
    return undefined;
  }

  const targetKey = keys[0] ?? '(unknown)';
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0) {
    console.error?.({
      msg: 'Empty numeric value for environment variable',
      keys,
      rawValue,
      targetKey
    });

    throw new Error(`Invalid numeric value "${rawValue}" for environment variable ${targetKey}`);
  }
  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue) || parsedValue < 0) {
    console.error?.({
      msg: 'Invalid numeric value for environment variable',
      keys,
      rawValue,
      targetKey,
      parsedValue
    });

    throw new Error(`Invalid numeric value "${rawValue}" for environment variable ${targetKey}`);
  }

  return parsedValue;
}

function sanitizeEnvForLogging(env: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(env).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = SECRET_TOKEN_PATTERN.test(key) && value ? '***redacted***' : value ?? '(unset)';
    return acc;
  }, {});
}

// Resolve each setting using the canonical var first, then legacy provider-specific aliases
// so existing deployments continue to work unchanged.
const envInput: EnvSchemaInput = {
  NODE_ENV: resolveEnvValue('NODE_ENV'),
  MODEL_PROVIDER: resolveEnumValue(
    MODEL_PROVIDER_VALUES,
    'AGENTIC_MODEL_PROVIDER',
    'MODEL_PROVIDER'
  ),
  // Shared base URL — canonical, then legacy provider-specific aliases
  MODEL_BASE_URL: resolveEnvValue(
    'MODEL_BASE_URL',
    'AGENTIC_MODEL_BASE_URL',
    'AGENTIC_OLLAMA_BASE_URL',
    'OLLAMA_BASE_URL',
    'AGENTIC_OPENAI_BASE_URL',
    'OPENAI_BASE_URL'
  ),
  // Shared API key — canonical, then legacy aliases
  MODEL_API_KEY: resolveEnvValue(
    'MODEL_API_KEY',
    'AGENTIC_MODEL_API_KEY',
    'AGENTIC_OPENAI_API_KEY',
    'OPENAI_API_KEY'
  ),
  // Text model name — canonical, then legacy aliases
  MODEL_NAME: resolveEnvValue(
    'MODEL_NAME',
    'AGENTIC_MODEL_NAME',
    'AGENTIC_OLLAMA_MODEL',
    'OLLAMA_MODEL',
    'AGENTIC_OPENAI_MODEL',
    'OPENAI_MODEL'
  ),
  // Vision model name for OCR — standalone only, falls back to MODEL_NAME in code
  VISION_MODEL_NAME: resolveEnvValue('VISION_MODEL_NAME'),
  MODEL_NUM_CTX: resolveNumber('MODEL_NUM_CTX'),
  MODEL_FORMAT_JSON: resolveEnvValue('MODEL_FORMAT_JSON'),
  MODEL_HTTP_HEADERS_TIMEOUT_MS: resolveNumber('MODEL_HTTP_HEADERS_TIMEOUT_MS'),
  MODEL_HTTP_BODY_TIMEOUT_MS: resolveNumber('MODEL_HTTP_BODY_TIMEOUT_MS'),
  TAVILY_API_KEY: resolveEnvValue('TAVILY_API_KEY'),
  SEARCH_RATE_LIMIT_DELAY_MS: resolveNumber('SEARCH_RATE_LIMIT_DELAY_MS'),
  SEARCH_MAX_PLANS: resolveNumber('SEARCH_MAX_PLANS'),
  SEARCH_MAX_AGENT_QUERIES_PER_REQUEST: resolveNumber('SEARCH_MAX_AGENT_QUERIES_PER_REQUEST'),
  AGENT_ACTOR_ID: resolveEnvValue('AGENT_ACTOR_ID')
};

function parseEnvConfig(): z.infer<typeof envSchema> {
  try {
    return envSchema.parse(envInput);
  } catch (err) {
    console.error?.({
      msg: 'Failed to parse agentic environment configuration',
      envKeys: sanitizeEnvForLogging(envInput as Record<string, unknown>),
      err
    });
    throw err;
  }
}

const parsedEnv = parseEnvConfig();

export type AgenticModelProvider = z.infer<typeof envSchema>['MODEL_PROVIDER'];

export interface AgenticModelConfig {
  provider: AgenticModelProvider;
  /** Base URL used for all model API calls (Ollama endpoint or OpenAI-compatible base). */
  baseUrl?: string;
  /** API key for OpenAI-compatible providers; unused for plain Ollama. */
  apiKey?: string;
  /** Model name for text tasks: extraction, planning, categorization, pricing. */
  textModel?: string;
  /**
   * Model name for vision/OCR tasks (photographed device labels).
   * Falls back to textModel when unset — requires the configured model to support vision input.
   */
  visionModel?: string;
  /** Ollama context window (num_ctx, tokens). Undefined ⇒ let Ollama use the model default. */
  numCtx?: number;
  /** Force Ollama responses to valid JSON (`format: "json"`). Off unless MODEL_FORMAT_JSON is truthy. */
  formatJson: boolean;
}

export interface AgenticSearchConfig {
  tavilyApiKey?: string;
  rateLimitDelayMs?: number;
}

export interface AgenticModelHttpConfig {
  /** undici header timeout (ms) for model fetches — the wall a slow first token hits. 0 disables it. */
  headersTimeoutMs: number;
  /** undici body timeout (ms) for model fetches — inter-chunk timeout while streaming. 0 disables it. */
  bodyTimeoutMs: number;
}

export interface AgenticSearchLimitsConfig {
  maxPlans: number;
  maxAgentQueriesPerRequest: number;
}

// TODO(agent): Validate configured search limits against production runbooks once env overrides are available.
const resolvedSearchMaxPlans = parsedEnv.SEARCH_MAX_PLANS ?? 3;
const resolvedSearchMaxAgentQueriesPerRequest = parsedEnv.SEARCH_MAX_AGENT_QUERIES_PER_REQUEST ?? 3;

// Default 8192: comfortably covers the largest prompt (extraction ~6–7k tokens) plus the JSON answer,
// while staying modest enough for a single mid-range GPU. Override via MODEL_NUM_CTX per hardware.
const DEFAULT_MODEL_NUM_CTX = 8192;

export const modelConfig: AgenticModelConfig = {
  provider: parsedEnv.MODEL_PROVIDER,
  baseUrl: parsedEnv.MODEL_BASE_URL,
  apiKey: parsedEnv.MODEL_API_KEY,
  textModel: parsedEnv.MODEL_NAME,
  visionModel: parsedEnv.VISION_MODEL_NAME,
  numCtx: parsedEnv.MODEL_NUM_CTX ?? DEFAULT_MODEL_NUM_CTX,
  formatJson: ['1', 'true', 'yes', 'on'].includes(
    (parsedEnv.MODEL_FORMAT_JSON ?? '').trim().toLowerCase()
  )
};

export const searchConfig: AgenticSearchConfig = {
  tavilyApiKey: parsedEnv.TAVILY_API_KEY,
  rateLimitDelayMs: parsedEnv.SEARCH_RATE_LIMIT_DELAY_MS
};

// Default 10 min matches OLLAMA_KEEP_ALIVE, so a cold model has the full keep-alive window to return its
// first token before undici treats the wait as a transport failure. Raising the ceiling is harmless for
// fast APIs (they respond well within it); it only delays the failure of a genuinely hung request.
export const modelHttpConfig: AgenticModelHttpConfig = {
  headersTimeoutMs: parsedEnv.MODEL_HTTP_HEADERS_TIMEOUT_MS ?? 600_000,
  bodyTimeoutMs: parsedEnv.MODEL_HTTP_BODY_TIMEOUT_MS ?? 600_000
};

export const searchLimits: AgenticSearchLimitsConfig = {
  maxPlans: resolvedSearchMaxPlans,
  maxAgentQueriesPerRequest: resolvedSearchMaxAgentQueriesPerRequest
};

export const agentActorId: string = parsedEnv.AGENT_ACTOR_ID?.trim() || 'item-flow-service';

export const nodeEnv = parsedEnv.NODE_ENV;

function resolveBooleanFlag(...keys: Array<keyof NodeJS.ProcessEnv>): boolean {
  const raw = resolveEnvValue(...keys);
  if (raw === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function resolveUnitInterval(fallback: number, ...keys: Array<keyof NodeJS.ProcessEnv>): number {
  const raw = resolveEnvValue(...keys);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.error?.({ msg: 'Invalid AUTO_APPROVE_MIN_CONFIDENCE; expected a number in [0,1]', raw });
    return fallback;
  }
  return parsed;
}

// Auto-approval: when enabled, a run whose extraction is clearly good (supervisor PASS + confidence ≥
// minConfidence + no missing-required fields + no ambiguous fields) is finalized as `auto_approved`
// instead of forced into manual review. Default OFF — enabling it is a deliberate operator choice,
// and `auto_approved` items are ERP-eligible (operators sort by state and decide what to sync).
export const autoApproveConfig: { enabled: boolean; minConfidence: number } = {
  enabled: resolveBooleanFlag('AUTO_APPROVE'),
  minConfidence: resolveUnitInterval(0.8, 'AUTO_APPROVE_MIN_CONFIDENCE')
};

// Idle-time deterministic rework sweeper: when enabled, the dispatcher (only while otherwise idle)
// re-applies the current spec contract to the oldest item enriched against an older contract version —
// re-stamping items already complete, or enqueuing a targeted rework for items now missing a required
// field. Default OFF. No LLM involved (deterministic gap check only).
export const autoReworkConfig: { enabled: boolean } = {
  enabled: resolveBooleanFlag('AUTO_REWORK')
};
