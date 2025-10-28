import { ShopwareAuthError, ShopwareNetworkError, ShopwareRequestError } from './errors';
import type { ShopwareClientOptions, ShopwareProductPayload, ShopwareRetryConfig, ShopwareTokenResponse } from './types';

const DEFAULT_RETRY_CONFIG: ShopwareRetryConfig = {
  retries: 2,
  minDelayMs: 250,
  maxDelayMs: 5000,
  backoffFactor: 2
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function resolveRetryConfig(custom?: Partial<ShopwareRetryConfig>): ShopwareRetryConfig {
  if (!custom) {
    return DEFAULT_RETRY_CONFIG;
  }

  return {
    retries: custom.retries ?? DEFAULT_RETRY_CONFIG.retries,
    minDelayMs: custom.minDelayMs ?? DEFAULT_RETRY_CONFIG.minDelayMs,
    maxDelayMs: custom.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    backoffFactor: custom.backoffFactor ?? DEFAULT_RETRY_CONFIG.backoffFactor
  };
}

async function defaultSleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

type RequestInitWithHeaders = RequestInit & { headers: Record<string, string> };

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  return { ...headers };
}

function toRequestInit(init: RequestInit | undefined, headers: Record<string, string>): RequestInitWithHeaders {
  const mergedHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...headersToRecord(init?.headers),
    ...headers
  };

  return {
    method: init?.method,
    body: init?.body,
    headers: mergedHeaders,
    signal: init?.signal,
    redirect: init?.redirect,
    keepalive: init?.keepalive,
    credentials: init?.credentials,
    mode: init?.mode,
    cache: init?.cache,
    referrer: init?.referrer,
    referrerPolicy: init?.referrerPolicy,
    integrity: init?.integrity,
    window: init?.window
  };
}

function parseExpiresAt(expiresIn: number): number {
  const refreshSafetyWindowMs = 30_000;
  const expiresInMs = Math.max(expiresIn * 1000 - refreshSafetyWindowMs, 0);
  return Date.now() + expiresInMs;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

export class ShopwareClient {
  private readonly baseUrl: string;

  private readonly logger: NonNullable<ShopwareClientOptions['logger']>;

  private readonly fetchImpl: typeof fetch;

  private readonly tokenEndpoint: string;

  private readonly retryConfig: ShopwareRetryConfig;

  private readonly sleep: (delayMs: number) => Promise<void>;

  private tokenState: TokenState | null = null;

  constructor(private readonly options: ShopwareClientOptions) {
    if (!options.baseUrl) {
      throw new Error('ShopwareClient requires a baseUrl');
    }
    if (!options.clientId) {
      throw new Error('ShopwareClient requires a clientId');
    }
    if (!options.clientSecret) {
      throw new Error('ShopwareClient requires a clientSecret');
    }

    this.baseUrl = stripTrailingSlash(options.baseUrl);
    this.logger = options.logger ?? console;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokenEndpoint = options.tokenEndpoint ?? '/api/oauth/token';
    this.retryConfig = resolveRetryConfig(options.retry);
    this.sleep = options.sleep ?? defaultSleep;
  }

  private buildUrl(path: string): string {
    if (!path) {
      return this.baseUrl;
    }
    if (/^https?:\/\//iu.test(path)) {
      return path;
    }

    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }

    return `${this.baseUrl}/${path}`;
  }

  private async ensureAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenState && this.tokenState.expiresAt > Date.now()) {
      return this.tokenState.token;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret
    });

    if (this.options.scope) {
      body.set('scope', this.options.scope);
    }

    const tokenUrl = this.buildUrl(this.tokenEndpoint);

    let response: Response;
    try {
      response = await this.fetchImpl(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString()
      });
    } catch (error) {
      this.logger.error?.('[shopware] Failed to fetch OAuth token', error);
      throw new ShopwareNetworkError('Failed to fetch Shopware token', { cause: error });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      this.logger.warn?.('[shopware] Failed to read OAuth token response body', error);
      text = '';
    }

    if (!response.ok) {
      this.logger.error?.('[shopware] OAuth token request failed', { status: response.status, body: text });
      throw new ShopwareAuthError(`Shopware token request failed with status ${response.status}`, {
        cause: new ShopwareRequestError('Shopware token request failed', { status: response.status, responseBody: text })
      });
    }

    let tokenResponse: ShopwareTokenResponse;
    try {
      tokenResponse = text ? (JSON.parse(text) as ShopwareTokenResponse) : ({} as ShopwareTokenResponse);
    } catch (error) {
      this.logger.error?.('[shopware] Failed to parse OAuth token response', error);
      throw new ShopwareAuthError('Shopware token response was not valid JSON', { cause: error });
    }

    if (!tokenResponse.access_token) {
      throw new ShopwareAuthError('Shopware token response missing access_token');
    }

    if (typeof tokenResponse.expires_in !== 'number' || !Number.isFinite(tokenResponse.expires_in)) {
      throw new ShopwareAuthError('Shopware token response missing expires_in');
    }

    this.tokenState = {
      token: tokenResponse.access_token,
      expiresAt: parseExpiresAt(tokenResponse.expires_in)
    };

    this.logger.info?.('[shopware] OAuth token refreshed successfully');

    return tokenResponse.access_token;
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof ShopwareNetworkError) {
      return true;
    }
    if (error instanceof ShopwareRequestError && error.status !== undefined) {
      if (error.status >= 500) {
        return true;
      }
      if (error.status === 429) {
        return true;
      }
    }

    return false;
  }

  private async delay(attempt: number): Promise<void> {
    const { minDelayMs, maxDelayMs, backoffFactor } = this.retryConfig;
    const rawDelay = minDelayMs * Math.pow(backoffFactor ?? 2, attempt);
    const clampedDelay = maxDelayMs ? Math.min(rawDelay, maxDelayMs) : rawDelay;
    await this.sleep(clampedDelay);
  }

  private async performRequest<T = unknown>(path: string, init: RequestInitWithHeaders): Promise<T> {
    const url = this.buildUrl(path);

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      this.logger.error?.('[shopware] Network error during request', error, { url, method: init.method });
      throw new ShopwareNetworkError('Shopware network request failed', { cause: error });
    }

    let responseText: string | null = null;
    try {
      responseText = await response.text();
    } catch (error) {
      this.logger.warn?.('[shopware] Failed to read response body', error, { url, method: init.method });
    }

    if (!response.ok) {
      this.logger.error?.('[shopware] Request failed', {
        url,
        method: init.method,
        status: response.status,
        body: responseText
      });
      throw new ShopwareRequestError(`Shopware request failed with status ${response.status}`, {
        status: response.status,
        responseBody: responseText
      });
    }

    if (!responseText) {
      return undefined as T;
    }

    try {
      return JSON.parse(responseText) as T;
    } catch (error) {
      this.logger.warn?.('[shopware] Response was not JSON, returning raw text', error, { url, method: init.method });
      return responseText as unknown as T;
    }
  }

  private async executeWithRetry<T>(executor: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await executor();
      } catch (error) {
        if (attempt >= this.retryConfig.retries || !this.shouldRetry(error)) {
          throw error;
        }
        await this.delay(attempt);
        attempt += 1;
      }
    }
  }

  private async authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    let forceRefresh = false;
    let token: string | null = null;
    let attempt = 0;

    const execute = async (): Promise<T> => {
      token = await this.ensureAccessToken(forceRefresh);
      forceRefresh = false;
      const initWithHeaders = toRequestInit(init, {
        Authorization: `Bearer ${token}`
      });
      return this.performRequest<T>(path, initWithHeaders);
    };

    while (true) {
      try {
        return await this.executeWithRetry(execute);
      } catch (error) {
        if (error instanceof ShopwareRequestError && error.status === 401 && attempt === 0) {
          this.logger.warn?.('[shopware] Request unauthorized - refreshing token and retrying');
          forceRefresh = true;
          this.tokenState = null;
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  async get<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.authenticatedRequest<T>(path, { ...init, method: 'GET' });
  }

  async post<T = unknown>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    const normalizedBody = body === undefined || body === null ? undefined : JSON.stringify(body);
    return this.authenticatedRequest<T>(path, { ...init, method: 'POST', body: normalizedBody });
  }

  async patch<T = unknown>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    const normalizedBody = body === undefined || body === null ? undefined : JSON.stringify(body);
    return this.authenticatedRequest<T>(path, { ...init, method: 'PATCH', body: normalizedBody });
  }

  async put<T = unknown>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    const normalizedBody = body === undefined || body === null ? undefined : JSON.stringify(body);
    return this.authenticatedRequest<T>(path, { ...init, method: 'PUT', body: normalizedBody });
  }

  async delete<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.authenticatedRequest<T>(path, { ...init, method: 'DELETE' });
  }

  async syncProducts(payload: unknown): Promise<unknown> {
    return this.post('/api/_action/sync', payload);
  }

  async upsertProduct(productId: string | null, payload: ShopwareProductPayload): Promise<unknown> {
    const path = productId ? `/api/product/${encodeURIComponent(productId)}` : '/api/product';
    const method = productId ? 'PATCH' : 'POST';
    const body = { ...payload };
    if (!productId) {
      delete body.id;
    }
    return method === 'PATCH' ? this.patch(path, body) : this.post(path, body);
  }
}

export default ShopwareClient;
