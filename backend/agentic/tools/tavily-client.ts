import type { ExternalApiLogger } from '../utils/external-api';
import type { SearchSource } from '../utils/source-formatter';

export interface TavilySearchLogger extends Pick<ExternalApiLogger, 'debug' | 'info' | 'warn' | 'error'> {}

export interface TavilySearchClientOptions {
  apiKey?: string | null;
  logger?: TavilySearchLogger;
  maxResults?: number;
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

  constructor(options: TavilySearchClientOptions = {}) {
    this.apiKey = options.apiKey ?? undefined;
    this.logger = options.logger ?? console;
    this.maxResults = Number.isFinite(options.maxResults) && (options.maxResults ?? 0) > 0 ? Number(options.maxResults) : 10;
  }

  private async getClient(): Promise<(
    query: string,
    params?: { maxResults?: number }
  ) => Promise<{ results?: unknown[] } | unknown>> {
    try {
      const module = await import('@tavily/core');
      const factory = (module as { tavily?: (config: { apiKey: string }) => { search: (query: string, params?: { maxResults?: number }) => Promise<unknown> } }).tavily;
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

    try {
      this.logger.info?.({ msg: 'Performing Tavily search', query: trimmedQuery, limit: effectiveLimit });
      const response = await search(trimmedQuery, { maxResults: effectiveLimit });
      const rawResults = Array.isArray((response as { results?: unknown[] })?.results)
        ? (response as { results?: unknown[] }).results
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
      if (statusCode === 429) {
        throw new RateLimitError('Tavily rate limit exceeded', statusCode, detail);
      }
      if ((err as { status?: number }).status === 429 || (err as { code?: number | string }).code === 429) {
        throw new RateLimitError('Tavily rate limit exceeded', 429, detail);
      }
      this.logger.error?.({ msg: 'Tavily search request failed', query: trimmedQuery, limit: effectiveLimit, err });
      throw err;
    }
  }
}
