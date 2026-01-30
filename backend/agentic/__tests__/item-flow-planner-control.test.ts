import type { SearchInvoker } from '../flow/item-flow-search';
import { collectSearchContexts, type PlannerDecision } from '../flow/item-flow-search';

describe('collectSearchContexts planner coordination', () => {
  it('skips invoking search when gating resolves to false', async () => {
    const searchInvoker = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const plannerDecision: PlannerDecision = {
      shouldSearch: false,
      plans: []
    };

    const result = await collectSearchContexts({
      searchTerm: 'Laborgerät 2000',
      searchInvoker,
      logger,
      itemId: 'item-planner-skip',
      target: {
        Artikel_Nummer: 'item-planner-skip',
        Artikelbeschreibung: 'Laborgerät 2000'
      },
      reviewNotes: 'Reviewer requested no external lookup',
      shouldSearch: false,
      plannerDecision,
      reviewerSkip: true
    });

    expect(searchInvoker).not.toHaveBeenCalled();
    expect(result.searchContexts).toHaveLength(0);
    expect(result.aggregatedSources).toHaveLength(0);
  });

  it('prioritises planner-provided queries before heuristic fallbacks', async () => {
    const calls: Array<{ query: string; metadata: unknown }> = [];
    const searchInvoker: SearchInvoker = jest.fn(async (query, _limit, metadata) => {
      calls.push({ query, metadata });
      return {
        text: `Result for ${query}`,
        sources: [
          {
            title: `Source for ${query}`,
            url: `https://example.com/${encodeURIComponent(query)}`,
            description: `Description for ${query}`
          }
        ]
      };
    });

    const plannerDecision: PlannerDecision = {
      shouldSearch: true,
      plans: [
        {
          query: 'Custom planner query',
          metadata: { context: 'planner', plannerSource: 'test' }
        }
      ]
    };

    const result = await collectSearchContexts({
      searchTerm: 'Laborgerät 3000',
      searchInvoker,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      itemId: 'item-planner-custom',
      target: {
        Artikel_Nummer: 'item-planner-custom',
        Artikelbeschreibung: 'Laborgerät 3000',
        Hersteller: 'Acme Instruments'
      },
      shouldSearch: true,
      plannerDecision
    });

    expect(searchInvoker).toHaveBeenCalledTimes(3);
    expect(calls.map((entry) => entry.query)).toEqual([
      'Gerätedaten Laborgerät 3000',
      'Custom planner query',
      'Gerätedaten Acme Instruments Laborgerät 3000'
    ]);
    expect(
      calls[1]?.metadata
    ).toEqual(
      expect.objectContaining({
        context: 'planner',
        plannerSource: 'test',
        requestIndex: 1
      })
    );
    expect(result.searchContexts).toHaveLength(3);
    expect(result.aggregatedSources).toHaveLength(3);
  });
});
