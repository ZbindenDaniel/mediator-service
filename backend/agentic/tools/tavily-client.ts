import type { SearchSource } from '../utils/source-formatter';

export interface TavilySearchLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface TavilySearchClientOptions {
  apiKey?: string | null;
  logger?: TavilySearchLogger;
  maxResults?: number;
  // Per-request timeout in seconds passed to the Tavily SDK. Defaults below 60s so a slow/hung request
  // fails fast into the retry path instead of blocking the serialized search queue for a full minute.
  timeoutSeconds?: number;
  // Bounded in-process retries for transient failures (timeouts, 5xx, malformed 2xx). This is the
  // safety net that lets the dispatcher treat a run's failure as terminal: a flaky provider blip is
  // absorbed here rather than permanently failing the item.
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

const DEFAULT_TIMEOUT_SECONDS = 20;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Classify a Tavily error as transient (worth retrying) vs terminal. Rate limits are raised as
// RateLimitError before this runs, so they never reach here.
function isTransientTavilyError(err: unknown): boolean {
  const status = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : undefined;
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 425;
  }
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (/timed out|etimedout|econnreset|econnrefused|enotfound|eai_again|fetch failed|socket hang up|network/.test(message)) {
    return true;
  }
  // The SDK formats HTTP failures as "<status> Error: <detail>". A 2xx or 5xx code here is a transient
  // upstream anomaly (e.g. the observed "200 Error: undefined" — a successful response with an
  // unparseable body); a 4xx is a genuine client/auth error and is not retried.
  const httpMatch = message.match(/^(\d{3}) error:/);
  if (httpMatch) {
    const code = Number.parseInt(httpMatch[1], 10);
    return code >= 500 || (code >= 200 && code < 300);
  }
  return false;
}

export interface SearchResult {
  text: string;
  sources: SearchSource[];
}

export class RateLimitError extends Error {
  public readonly statusCode?: number;
  public readonly detail?: unknown;

  constructor(message: string, statusCode?: number, detail?: unknown) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

function formatResultText(query: string, sources: SearchSource[]): string {
  if (!sources.length) {
    return `No web results found for "${query}".`;
  }
  const lines = sources.map((source, index) => {
    const parts = [`${index + 1}. ${source.title || '(no title)'}`];
    if (source.url) {
      parts.push(source.url);
    }
    const description = typeof source.description === 'string' && source.description.trim()
      ? source.description.trim()
      : typeof source.content === 'string' && source.content.trim()
        ? source.content.trim()
        : null;
    if (description) {
      parts.push(description);
    }
    return parts.join(' | ');
  });
  return [`WEB RESULTS for "${query}":`, ...lines].join('\n');
}

function normalizeSource(raw: unknown): SearchSource | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const title = typeof candidate.title === 'string' ? candidate.title : typeof candidate.name === 'string' ? candidate.name : '';
  const url = typeof candidate.url === 'string' ? candidate.url : typeof candidate.link === 'string' ? candidate.link : '';
  const content = typeof candidate.content === 'string' ? candidate.content : typeof candidate.snippet === 'string' ? candidate.snippet : '';
  const description = typeof candidate.description === 'string' ? candidate.description : content;
  return {
    ...candidate,
    title,
    url,
    description,
    content
  };
}

export class TavilySearchClient {
  private readonly apiKey?: string;
  private readonly logger: TavilySearchLogger;
  private readonly maxResults: number;
  private readonly timeoutSeconds: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: TavilySearchClientOptions = {}) {
    this.apiKey = options.apiKey ?? undefined;
    this.logger = options.logger ?? console;
    this.maxResults = Number.isFinite(options.maxResults) && (options.maxResults ?? 0) > 0 ? Number(options.maxResults) : 10;
    this.timeoutSeconds = Number.isFinite(options.timeoutSeconds) && (options.timeoutSeconds ?? 0) > 0
      ? Number(options.timeoutSeconds)
      : DEFAULT_TIMEOUT_SECONDS;
    this.maxAttempts = Number.isFinite(options.maxAttempts) && (options.maxAttempts ?? 0) > 0
      ? Math.floor(Number(options.maxAttempts))
      : DEFAULT_MAX_ATTEMPTS;
    this.retryBaseDelayMs = Number.isFinite(options.retryBaseDelayMs) && (options.retryBaseDelayMs ?? 0) >= 0
      ? Number(options.retryBaseDelayMs)
      : DEFAULT_RETRY_BASE_DELAY_MS;
  }

  private async getClient(): Promise<(
    query: string,
    params?: { maxResults?: number; timeout?: number }
  ) => Promise<{ results?: unknown[] } | unknown>> {
    try {
      const module = await import('@tavily/core');
      const factory = (module as { tavily?: (config: { apiKey: string }) => { search: (query: string, params?: { maxResults?: number; timeout?: number }) => Promise<unknown> } }).tavily;
      if (typeof factory !== 'function') {
        throw new Error('Tavily client factory did not return a function');
      }
      if (!this.apiKey) {
        throw new Error('Tavily API key is required to perform web searches');
      }
      const client = factory({ apiKey: this.apiKey });
      if (!client || typeof client.search !== 'function') {
        throw new Error('Tavily client is missing a search method');
      }
      return client.search.bind(client);
    } catch (err) {
      this.logger.error?.({ msg: 'Failed to initialize Tavily client', err });
      throw err;
    }
  }

  private coerceLimit(limit: number | undefined): number {
    const parsed = Number.isFinite(limit) ? Number(limit) : this.maxResults;
    const clamped = Math.max(1, Math.min(parsed || this.maxResults, this.maxResults));
    return clamped;
  }

  public async search(query: string, limit = this.maxResults): Promise<SearchResult> {
    if (!query || typeof query !== 'string') {
      throw new Error('search query must be a non-empty string');
    }

    const trimmedQuery = query.trim();
    const effectiveLimit = this.coerceLimit(limit);
    const search = await this.getClient();

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        this.logger.info?.({ msg: 'Performing Tavily search', query: trimmedQuery, limit: effectiveLimit, attempt });
        const response = await search(trimmedQuery, { maxResults: effectiveLimit, timeout: this.timeoutSeconds });
        const candidate = (response as { results?: unknown[] })?.results;
        const rawResults = Array.isArray(candidate)
          ? candidate
          : Array.isArray(response)
            ? (response as unknown[])
            : [];

        const sources = rawResults
          .map((entry) => normalizeSource(entry))
          .filter((entry): entry is SearchSource => Boolean(entry))
          .slice(0, effectiveLimit);

        this.logger.debug?.({ msg: 'Tavily search completed', query: trimmedQuery, resultCount: sources.length });
        return {
          text: formatResultText(trimmedQuery, sources),
          sources
        };
      } catch (err) {
        const statusCode = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : undefined;
        const detail = (err as { response?: unknown }).response ?? (err as { detail?: unknown }).detail;
        // Rate limits are surfaced verbatim so the caller can back off the whole queue — not retried here.
        if (statusCode === 429 || (err as { code?: number | string }).code === 429) {
          throw new RateLimitError('Tavily rate limit exceeded', 429, detail);
        }

        lastErr = err;
        const canRetry = attempt < this.maxAttempts && isTransientTavilyError(err);
        if (!canRetry) {
          this.logger.error?.({ msg: 'Tavily search request failed', query: trimmedQuery, limit: effectiveLimit, attempt, err });
          throw err;
        }
        const backoffMs = this.retryBaseDelayMs * 2 ** (attempt - 1);
        this.logger.warn?.({ msg: 'Tavily search transient failure; retrying', query: trimmedQuery, attempt, backoffMs, err });
        await delay(backoffMs);
      }
    }
    // Unreachable in practice (the loop returns or throws), but satisfies the type checker.
    throw lastErr ?? new Error('Tavily search failed');
  }
}
