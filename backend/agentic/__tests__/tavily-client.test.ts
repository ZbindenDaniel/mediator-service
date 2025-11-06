import { jest } from '@jest/globals';
import { TavilySearchClient, type TavilySearchLogger } from '../tools/tavily-client';

const searchMock = jest.fn();

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
    searchMock.mockResolvedValue({ foo: 'bar' });
    const client = new TavilySearchClient({ apiKey: 'test-key', logger });

    const result = await client.search('sample query');

    expect(searchMock).toHaveBeenCalledWith('sample query', { maxResults: 10 });
    expect(result.sources).toEqual([]);
    expect(result.text).toBe('No web results found for "sample query".');
  });
});
