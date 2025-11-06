import { jest } from '@jest/globals';

const createLogger = () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
});

describe('prepareItemContext', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('resolves item id, target, and search term', async () => {
    const logger = createLogger();
    const { prepareItemContext } = await import('../../backend/agentic/flow/context');

    const context = prepareItemContext(
      {
        target: { itemUUid: 'item-123', Artikelbeschreibung: '  Example item  ' },
        id: null,
        search: ' Custom search '
      },
      logger
    );

    expect(context.itemId).toBe('item-123');
    expect(context.target.Artikelbeschreibung).toBe('Example item');
    expect(context.searchTerm).toBe('Custom search');
    expect(() => context.checkCancellation()).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('loadPrompts', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('throws FlowError when required prompt cannot be loaded', async () => {
    const logger = createLogger();
    const readFile = jest.fn().mockRejectedValue(new Error('missing'));

    jest.doMock('fs/promises', () => ({ readFile }));

    await jest.isolateModulesAsync(async () => {
      const { loadPrompts } = await import('../../backend/agentic/flow/prompts');
      await expect(loadPrompts({ itemId: 'item-404', logger })).rejects.toMatchObject({ code: 'PROMPT_LOAD_FAILED' });
    });

    expect(readFile).toHaveBeenCalled();
  });
});

describe('dispatchAgenticResult', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('marks notification failure when applyAgenticResult throws', async () => {
    const { dispatchAgenticResult } = await import('../../backend/agentic/flow/result-dispatch');
    const payload = {
      itemId: 'item-001',
      status: 'completed',
      error: null,
      needsReview: false,
      summary: 'ok',
      reviewDecision: 'approved',
      reviewNotes: null,
      reviewedBy: null,
      actor: 'agent',
      item: { itemUUid: 'item-001', searchQuery: 'query' }
    };

    const options = {
      itemId: 'item-001',
      payload,
      logger: createLogger(),
      saveRequestPayload: jest.fn(),
      applyAgenticResult: jest.fn(async () => {
        throw new Error('dispatch failed');
      }),
      markNotificationSuccess: jest.fn(),
      markNotificationFailure: jest.fn(),
      checkCancellation: jest.fn()
    };

    await expect(dispatchAgenticResult(options)).rejects.toThrow('dispatch failed');
    expect(options.markNotificationFailure).toHaveBeenCalledWith('item-001', 'dispatch failed');
    expect(options.markNotificationSuccess).not.toHaveBeenCalled();
  });
});

describe('runItemFlow', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('short-circuits when shopware shortcut succeeds', async () => {
    const mockDispatch = jest.fn().mockResolvedValue(undefined);
    const mockPrepare = jest.fn(() => ({
      itemId: 'item-777',
      target: { itemUUid: 'item-777', Artikelbeschreibung: 'Example' },
      searchTerm: 'Example',
      checkCancellation: jest.fn(),
      cancellationSignal: null
    }));
    const mockLoadPrompts = jest.fn().mockResolvedValue({
      format: '{}',
      extract: 'extract',
      supervisor: 'supervisor',
      shopware: 'prompt'
    });
    const mockResolve = jest.fn().mockResolvedValue({
      finalData: { itemUUid: 'item-777', Artikelbeschreibung: 'Example' },
      sources: [],
      summary: 'Shopware match',
      reviewNotes: 'notes',
      reviewedBy: 'agent'
    });
    const mockCollect = jest.fn();
    const mockExtraction = jest.fn();

    jest.doMock('../../backend/agentic/flow/context', () => ({ prepareItemContext: mockPrepare }));
    jest.doMock('../../backend/agentic/flow/prompts', () => ({ loadPrompts: mockLoadPrompts }));
    jest.doMock('../../backend/agentic/flow/result-dispatch', () => ({ dispatchAgenticResult: mockDispatch }));
    jest.doMock('../../backend/agentic/flow/item-flow-shopware', () => ({ resolveShopwareMatch: mockResolve }));
    jest.doMock('../../backend/agentic/flow/item-flow-search', () => ({ collectSearchContexts: mockCollect }));
    jest.doMock('../../backend/agentic/flow/item-flow-extraction', () => ({ runExtractionAttempts: mockExtraction }));
    jest.doMock('../../backend/agentic/tools/shopware', () => ({
      isShopwareConfigured: jest.fn(() => true),
      searchShopwareRaw: jest.fn(async () => ({ text: 'ctx', products: [] }))
    }));

    await jest.isolateModulesAsync(async () => {
      const { runItemFlow } = await import('../../backend/agentic/flow/item-flow');
      const payload = await runItemFlow(
        { target: { itemUUid: 'item-777', Artikelbeschreibung: 'Example' } },
        {
          llm: { invoke: jest.fn() },
          logger: createLogger(),
          searchInvoker: jest.fn(),
          saveRequestPayload: jest.fn(),
          markNotificationSuccess: jest.fn(),
          markNotificationFailure: jest.fn(),
          applyAgenticResult: jest.fn()
        }
      );

      expect(payload.status).toBe('completed');
      expect(mockCollect).not.toHaveBeenCalled();
      expect(mockExtraction).not.toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-777' }));
    });
  });

  test('executes extraction when shopware shortcut is unavailable', async () => {
    const mockDispatch = jest.fn().mockResolvedValue(undefined);
    const checkCancellation = jest.fn();
    const mockPrepare = jest.fn(() => ({
      itemId: 'item-888',
      target: { itemUUid: 'item-888', Artikelbeschreibung: 'Example' },
      searchTerm: 'Example',
      checkCancellation,
      cancellationSignal: null
    }));
    const mockLoadPrompts = jest.fn().mockResolvedValue({
      format: '{}',
      extract: 'extract',
      supervisor: 'supervisor',
      shopware: null
    });
    const mockResolve = jest.fn().mockResolvedValue(null);
    const mockCollect = jest.fn().mockResolvedValue({
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: jest.fn()
    });
    const mockExtraction = jest.fn().mockResolvedValue({
      success: true,
      data: { Artikelbeschreibung: 'Example', itemUUid: 'item-888' },
      supervisor: 'ok',
      sources: []
    });

    jest.doMock('../../backend/agentic/flow/context', () => ({ prepareItemContext: mockPrepare }));
    jest.doMock('../../backend/agentic/flow/prompts', () => ({ loadPrompts: mockLoadPrompts }));
    jest.doMock('../../backend/agentic/flow/result-dispatch', () => ({ dispatchAgenticResult: mockDispatch }));
    jest.doMock('../../backend/agentic/flow/item-flow-shopware', () => ({ resolveShopwareMatch: mockResolve }));
    jest.doMock('../../backend/agentic/flow/item-flow-search', () => ({ collectSearchContexts: mockCollect }));
    jest.doMock('../../backend/agentic/flow/item-flow-extraction', () => ({ runExtractionAttempts: mockExtraction }));
    jest.doMock('../../backend/agentic/tools/shopware', () => ({
      isShopwareConfigured: jest.fn(() => false),
      searchShopwareRaw: jest.fn()
    }));

    await jest.isolateModulesAsync(async () => {
      const { runItemFlow } = await import('../../backend/agentic/flow/item-flow');
      const payload = await runItemFlow(
        { target: { itemUUid: 'item-888', Artikelbeschreibung: 'Example' } },
        {
          llm: { invoke: jest.fn() },
          logger: createLogger(),
          searchInvoker: jest.fn(async () => ({ text: 'ctx', sources: [] })),
          saveRequestPayload: jest.fn(),
          markNotificationSuccess: jest.fn(),
          markNotificationFailure: jest.fn(),
          applyAgenticResult: jest.fn()
        }
      );

      expect(mockCollect).toHaveBeenCalled();
      expect(mockExtraction).toHaveBeenCalled();
      expect(checkCancellation).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-888' }));
      expect(payload.item.itemUUid).toBe('item-888');
    });
  });
});
