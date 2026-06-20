import { collectSearchContexts, type SearchInvoker } from '../flow/item-flow-search';
import type { SearchResult } from '../tools/tavily-client';

describe('collectSearchContexts', () => {
  it('accepts partial logger implementations and returns search contexts', async () => {
    const info = jest.fn();
    const searchInvoker: SearchInvoker = jest.fn(async (query: string): Promise<SearchResult> => ({
      text: `result for ${query}`,
      sources: [
        {
          title: 'Example source',
          url: 'https://example.com',
          description: 'Description',
          content: 'Content'
        }
      ]
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Widget',
      searchInvoker,
      logger: { info },
      itemId: 'item-123',
      shouldSearch: true
    });

    expect(searchInvoker).toHaveBeenCalledWith(
      expect.stringContaining('Widget'),
      expect.any(Number),
      expect.objectContaining({ context: expect.any(String) })
    );
    expect(result.searchContexts.length).toBeGreaterThan(0);
    expect(result.aggregatedSources.length).toBeGreaterThan(0);
  });

  it('returns empty search contexts when shouldSearch is false', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async (query: string): Promise<SearchResult> => ({
      text: `result for ${query}`,
      sources: []
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Widget',
      searchInvoker,
      itemId: 'item-skip',
      shouldSearch: false
    });

    expect(searchInvoker).not.toHaveBeenCalled();
    expect(result.searchContexts).toHaveLength(0);
    expect(result.aggregatedSources).toHaveLength(0);
  });

  it('buildAggregatedSearchText returns combined source texts', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async (): Promise<SearchResult> => ({
      text: 'widget specification text',
      sources: [{ title: 'A', url: 'https://a.com', description: 'desc', content: 'widget specification text' }]
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Widget',
      searchInvoker,
      itemId: 'item-agg',
      shouldSearch: true
    });

    const aggregated = result.buildAggregatedSearchText();
    expect(typeof aggregated).toBe('string');
    expect(aggregated.length).toBeGreaterThan(0);
  });

  it('deduplicates sources by URL across multiple search calls', async () => {
    let callCount = 0;
    const sharedSource = { title: 'Shared', url: 'https://shared.com', description: 'shared', content: 'data' };
    const searchInvoker: SearchInvoker = jest.fn(async (): Promise<SearchResult> => {
      callCount++;
      return { text: 'text', sources: [sharedSource] };
    });

    const result = await collectSearchContexts({
      searchTerm: 'Widget',
      searchInvoker,
      itemId: 'item-dedup',
      shouldSearch: true
    });

    // Even with multiple search plans, the same URL should appear only once in aggregatedSources
    const urls = result.aggregatedSources.map((s) => s.url);
    const uniqueUrls = new Set(urls);
    expect(urls.length).toBe(uniqueUrls.size);
  });
});
