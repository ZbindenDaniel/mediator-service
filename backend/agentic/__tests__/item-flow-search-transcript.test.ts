import type { AgentTranscriptWriter } from '../flow/transcript';
import { appendTranscriptSection } from '../flow/transcript';
import type { SearchInvoker } from '../flow/item-flow-search';
import { collectSearchContexts } from '../flow/item-flow-search';

jest.mock('../flow/transcript', () => ({
  appendTranscriptSection: jest.fn()
}));

describe('collectSearchContexts transcript integration', () => {
  const mockedAppendTranscriptSection = appendTranscriptSection as jest.MockedFunction<typeof appendTranscriptSection>;

  beforeEach(() => {
    mockedAppendTranscriptSection.mockReset();
    mockedAppendTranscriptSection.mockResolvedValue(undefined);
  });

  it('appends a transcript section after successful search requests', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async (query) => ({
      text: `Result text for ${query}`,
      sources: [
        {
          title: `Source ${query}`,
          url: `https://example.com/${encodeURIComponent(query)}`,
          description: `Description ${query}`,
          content: `Content ${query}`
        }
      ]
    }));

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const transcriptWriter: AgentTranscriptWriter = {
      filePath: '/tmp/transcript.html',
      publicUrl: '/media/item-transcript/agentic-transcript.html',
      appendSection: jest.fn(async () => undefined)
    };

    await collectSearchContexts({
      searchTerm: 'Laborgerät 5000',
      searchInvoker,
      logger,
      itemId: 'item-transcript-success',
      shouldSearch: true,
      transcriptWriter,
      plannerDecision: {
        shouldSearch: true,
        plans: [{ query: 'Gerätedaten Laborgerät 5000', metadata: { context: 'planner' } }]
      }
    });

    expect(mockedAppendTranscriptSection).toHaveBeenCalledTimes(1);
    expect(mockedAppendTranscriptSection).toHaveBeenCalledWith(
      transcriptWriter,
      'search-context-1',
      expect.objectContaining({
        query: 'Gerätedaten Laborgerät 5000',
        metadata: expect.objectContaining({ requestIndex: 0 }),
        sourceCount: 1,
        sources: [
          expect.objectContaining({
            title: 'Source Gerätedaten Laborgerät 5000',
            url: 'https://example.com/Ger%C3%A4tedaten%20Laborger%C3%A4t%205000',
            description: 'Description Gerätedaten Laborgerät 5000',
            content: 'Content Gerätedaten Laborgerät 5000'
          })
        ]
      }),
      'Result text for Gerätedaten Laborgerät 5000',
      logger,
      'item-transcript-success'
    );
  });

  it('logs transcript append failures and does not throw', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async () => ({
      text: 'search text',
      sources: []
    }));

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockedAppendTranscriptSection.mockRejectedValueOnce(new Error('append failed'));

    await expect(
      collectSearchContexts({
        searchTerm: 'Laborgerät 6000',
        searchInvoker,
        logger,
        itemId: 'item-transcript-fail',
        shouldSearch: true,
        transcriptWriter: {
          filePath: '/tmp/transcript.html',
          publicUrl: '/media/item-transcript/agentic-transcript.html',
          appendSection: jest.fn(async () => undefined)
        },
        plannerDecision: {
          shouldSearch: true,
          plans: [{ query: 'Gerätedaten Laborgerät 6000', metadata: { context: 'planner' } }]
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        searchContexts: expect.any(Array),
        aggregatedSources: expect.any(Array)
      })
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'failed to append search transcript section',
        itemId: 'item-transcript-fail',
        requestIndex: 0,
        err: expect.any(Error)
      })
    );
  });

  it('keeps searchContexts and aggregatedSources behavior unchanged when transcript writing is enabled', async () => {
    const searchInvoker: SearchInvoker = jest.fn(async () => ({
      text: 'search text body',
      sources: [
        { title: 'Source 1', url: 'https://example.com/1', description: 'desc 1' },
        { title: 'Source 1 duplicate', url: 'https://example.com/1', description: 'desc duplicate' },
        { title: 'Source 2', url: 'https://example.com/2', description: 'desc 2' }
      ]
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Laborgerät 7000',
      searchInvoker,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      itemId: 'item-transcript-stable',
      shouldSearch: true,
      transcriptWriter: {
        filePath: '/tmp/transcript.html',
        publicUrl: '/media/item-transcript/agentic-transcript.html',
        appendSection: jest.fn(async () => undefined)
      },
      plannerDecision: {
        shouldSearch: true,
        plans: [{ query: 'Gerätedaten Laborgerät 7000', metadata: { context: 'planner' } }]
      }
    });

    expect(result.searchContexts).toHaveLength(1);
    expect(result.searchContexts[0]).toEqual(
      expect.objectContaining({
        query: 'Gerätedaten Laborgerät 7000',
        text: 'search text body'
      })
    );
    expect(result.aggregatedSources).toHaveLength(2);
    expect(result.aggregatedSources.map((source) => source.url)).toEqual([
      'https://example.com/1',
      'https://example.com/2'
    ]);
  });
});
