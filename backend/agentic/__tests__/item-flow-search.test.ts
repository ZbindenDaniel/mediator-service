import { collectSearchContexts, type SearchInvoker } from '../flow/item-flow-search';
import type { SearchResult } from '../tools/tavily-client';

describe('collectSearchContexts', () => {
  it('accepts partial logger implementations', async () => {
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
      itemId: 'item-123'
    });

    expect(searchInvoker).toHaveBeenCalledWith(
      expect.stringContaining('Widget'),
      10,
      expect.objectContaining({ context: 'primary' })
    );
    expect(result.searchContexts).toHaveLength(1);
    expect(result.aggregatedSources).toHaveLength(1);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'search start' }));
  });
});
