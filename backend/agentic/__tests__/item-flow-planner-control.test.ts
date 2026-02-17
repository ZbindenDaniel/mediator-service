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
    expect(result.aggregatedSources).toHaveLength(2);
  });

  it('rejects taxonomy-targeted planner queries and keeps product-fact queries', async () => {
    const calls: string[] = [];
    const searchInvoker: SearchInvoker = jest.fn(async (query) => {
      calls.push(query);
      return { text: `Result for ${query}`, sources: [] };
    });

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    await collectSearchContexts({
      searchTerm: 'Laborgerät 3050',
      searchInvoker,
      logger,
      itemId: 'item-taxonomy-reject',
      shouldSearch: true,
      plannerDecision: {
        shouldSearch: true,
        plans: [
          {
            query: 'Hauptkategorien_A code prüfen 12-34',
            metadata: { context: 'planner' }
          },
          {
            query: 'Hersteller Datenblatt Laborgerät 3050',
            metadata: { context: 'planner' }
          }
        ]
      }
    });

    expect(calls).toEqual(['Gerätedaten Laborgerät 3050', 'Hersteller Datenblatt Laborgerät 3050']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'taxonomy-targeted search plans rejected',
        itemId: 'item-taxonomy-reject',
        taxonomyRejectedCount: 1
      })
    );
  });

  it('retains missing-field and locked-field plans when max plan limit truncates merged plans', async () => {
    const calls: Array<{ query: string; metadata: unknown }> = [];
    const searchInvoker: SearchInvoker = jest.fn(async (query, _limit, metadata) => {
      calls.push({ query, metadata });
      return {
        text: `Result for ${query}`,
        sources: []
      };
    });

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const plannerDecision: PlannerDecision = {
      shouldSearch: true,
      plans: [
        {
          query: 'Plan targeting missing fields',
          metadata: { context: 'planner', plannerSource: 'test', missingFields: ['Verkaufspreis'] }
        },
        {
          query: 'Generic planner follow-up',
          metadata: { context: 'planner', plannerSource: 'test' }
        }
      ]
    };

    await collectSearchContexts({
      searchTerm: 'Laborgerät 4000',
      searchInvoker,
      logger,
      itemId: 'item-planner-limit-priority',
      target: {
        Artikel_Nummer: 'item-planner-limit-priority',
        Artikelbeschreibung: 'Laborgerät 4000',
        Hersteller: 'Acme Instruments',
        Kurzbeschreibung: 'Profi Testsystem',
        Seriennummer: 'SN-4000-XYZ',
        __locked: ['Seriennummer']
      },
      shouldSearch: true,
      plannerDecision
    });

    expect(searchInvoker).toHaveBeenCalledTimes(3);
    expect(calls.map((entry) => entry.query)).toEqual([
      'Plan targeting missing fields',
      'Gerätedaten Laborgerät 4000 Seriennummer:SN-4000-XYZ',
      'Gerätedaten Acme Instruments Laborgerät 4000'
    ]);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'search plan limit applied',
        truncatedPlans: expect.arrayContaining(['Gerätedaten Laborgerät 4000']),
        truncatedPlanMetadata: expect.arrayContaining([
          expect.objectContaining({
            query: 'Generic planner follow-up'
          })
        ])
      })
    );
  });

  it('deduplicates repeated sources and caps repeated domains while logging retrieval metrics', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async () => ({
      text: 'ok',
      sources: [
        { title: 'T1', url: 'https://vendor.example/a', description: 'A' },
        { title: 'T1', url: 'https://vendor.example/a', description: 'A duplicate' },
        { title: 'T2', url: 'https://vendor.example/b', description: 'B' },
        { title: 'T3', url: 'https://vendor.example/c', description: 'C should be capped' },
        { title: 'M1', url: 'https://manufacturer.example/spec', description: 'Spec' }
      ]
    }));

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const result = await collectSearchContexts({
      searchTerm: 'Laborgerät 9000',
      searchInvoker,
      logger,
      itemId: 'item-retrieval-metrics',
      shouldSearch: true,
      plannerDecision: {
        shouldSearch: true,
        plans: [
          { query: 'Gerätedaten Laborgerät 9000', metadata: { context: 'planner' } },
          { query: '  gerätedaten   laborgerät 9000  ', metadata: { context: 'planner' } }
        ]
      }
    });

    expect(result.aggregatedSources).toHaveLength(3);
    expect(result.aggregatedSources.map((source) => source.url)).toEqual([
      'https://vendor.example/a',
      'https://vendor.example/b',
      'https://manufacturer.example/spec'
    ]);

    const retrievalMetricCall = logger.info.mock.calls.find(
      ([entry]) => (entry as { msg?: string } | undefined)?.msg === 'search retrieval metrics'
    );
    expect(retrievalMetricCall).toBeDefined();
    expect(retrievalMetricCall?.[0]).toEqual(
      expect.objectContaining({
        msg: 'search retrieval metrics',
        itemId: 'item-retrieval-metrics',
        uniqueQueries: 1,
        uniqueDomains: 2,
      })
    );
    expect((retrievalMetricCall?.[0] as { duplicateSuppressionCount?: number }).duplicateSuppressionCount).toBeGreaterThanOrEqual(3);
  });
});
