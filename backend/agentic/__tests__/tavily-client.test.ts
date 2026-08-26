import { jest } from '@jest/globals';
import { TavilySearchClient, type TavilySearchLogger } from '../tools/tavily-client';

const searchMock: jest.MockedFunction<
  (query: string, params?: { maxResults?: number }) => Promise<{ results?: unknown[] } | unknown>
> = jest.fn();

jest.mock('@tavily/core', () => ({
  tavily: jest.fn(() => ({
    search: searchMock
  }))
}));

describe('TavilySearchClient', () => {
  const logger: Required<TavilySearchLogger> = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    searchMock.mockReset();
  });

  it('returns empty sources when response lacks a results array', async () => {
    searchMock.mockResolvedValue({ text: 'mock search results', sources: [] });
    const client = new TavilySearchClient({ apiKey: 'test-key', logger });

    const result = await client.search('sample query');

    expect(searchMock).toHaveBeenCalledWith('sample query', expect.objectContaining({ maxResults: 10 }));
    expect(result.sources).toEqual([]);
    expect(result.text).toBe('No web results found for "sample query".');
  });

  it('retries a transient failure and then succeeds', async () => {
    // The observed "200 Error: undefined" (a successful HTTP response with an unparseable body) is a
    // transient upstream anomaly and must be retried, not propagated as a hard failure.
    searchMock.mockRejectedValueOnce(new Error('200 Error: undefined'));
    searchMock.mockResolvedValueOnce({ results: [{ title: 'T', url: 'https://x', content: 'c' }] });
    const client = new TavilySearchClient({ apiKey: 'test-key', logger, retryBaseDelayMs: 0 });

    const result = await client.search('retry query');

    expect(searchMock).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
  });

  it('does not retry a non-transient 4xx error', async () => {
    const err = Object.assign(new Error('401 Error: unauthorized'), { status: 401 });
    searchMock.mockRejectedValue(err);
    const client = new TavilySearchClient({ apiKey: 'test-key', logger, retryBaseDelayMs: 0 });

    await expect(client.search('auth query')).rejects.toThrow('401');
    expect(searchMock).toHaveBeenCalledTimes(1);
  });
});
