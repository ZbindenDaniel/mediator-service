import type { ChatModel } from '../flow/item-flow-extraction';

// TODO(agent): Extend invoker adapter tests when additional provider adapters are introduced.

const ORIGINAL_MODEL_PROVIDER = process.env.MODEL_PROVIDER;

describe('AgenticModelInvoker chat model adaptation', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MODEL_PROVIDER = 'ollama';
  });

  afterEach(() => {
    jest.resetModules();
    if (ORIGINAL_MODEL_PROVIDER === undefined) {
      delete process.env.MODEL_PROVIDER;
    } else {
      process.env.MODEL_PROVIDER = ORIGINAL_MODEL_PROVIDER;
    }
    jest.clearAllMocks();
  });

  it('logs and throws when the instantiated client is missing an invoke method', async () => {
    const error = jest.fn();

    jest.doMock(
      '@langchain/ollama',
      () => ({
        ChatOllama: jest.fn(() => ({}))
      }),
      { virtual: true }
    );

    const { AgenticModelInvoker } = await import('../invoker');

    const invoker = new AgenticModelInvoker({ logger: { error } });
    const ensureChatModel = (invoker as unknown as { ensureChatModel(): Promise<ChatModel> }).ensureChatModel;

    await expect(ensureChatModel.call(invoker)).rejects.toMatchObject({ code: 'OLLAMA_UNAVAILABLE' });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'ollama client missing invoke method' }));
  });

  it('wraps invoke to maintain the ChatModel contract', async () => {
    let capturedThis: unknown;

    class MockChatOllama {
      public readonly marker = 'ollama-client';

      public constructor() {
        capturedThis = null;
      }

      public async invoke(this: MockChatOllama, messages: Array<{ role: string; content: unknown }>) {
        capturedThis = this;
        return { content: { marker: this.marker, messages } };
      }
    }

    jest.doMock(
      '@langchain/ollama',
      () => ({
        ChatOllama: MockChatOllama
      }),
      { virtual: true }
    );

    const { AgenticModelInvoker } = await import('../invoker');

    const invoker = new AgenticModelInvoker();
    const ensureChatModel = (invoker as unknown as { ensureChatModel(): Promise<ChatModel> }).ensureChatModel;
    const chatModel = await ensureChatModel.call(invoker);

    const messages = [{ role: 'user', content: 'hello' }];
    const response = await chatModel.invoke(messages);

    expect(response).toEqual({ content: { marker: 'ollama-client', messages } });
    expect(capturedThis).toEqual(expect.objectContaining({ marker: 'ollama-client' }));
  });
});

describe('AgenticModelInvoker request payload merging', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MODEL_PROVIDER = 'ollama';
  });

  afterEach(() => {
    jest.resetModules();
    if (ORIGINAL_MODEL_PROVIDER === undefined) {
      delete process.env.MODEL_PROVIDER;
    } else {
      process.env.MODEL_PROVIDER = ORIGINAL_MODEL_PROVIDER;
    }
    jest.clearAllMocks();
  });

  it('merges saved request payload overrides into the invocation target', async () => {
    const runItemFlow = jest.fn().mockResolvedValue({ status: 'completed', summary: 'ok' });
    const requestPayload = {
      target: {
        __locked: ['Artikel_Nummer'],
        Artikel_Nummer: 'LOCK-42',
        Kurzbeschreibung: 'User Short',
        Artikelbeschreibung: 'User Description'
      }
    };
    const getAgenticRequestLog = jest.fn(() => ({ PayloadJson: JSON.stringify(requestPayload) }));
    const getItem = {
      get: jest.fn(() => ({
        ItemUUID: 'I-123-0001',
        Artikelbeschreibung: '',
        Verkaufspreis: 125,
        Kurzbeschreibung: 'Base Short',
        Langtext: { short: 'Base Long', extra: 5 },
        Hersteller: 'Base Maker',
        Länge_mm: null,
        Breite_mm: null,
        Höhe_mm: null,
        Gewicht_kg: null
      }))
    };

    jest.doMock('../tools/tavily-client', () => ({
      TavilySearchClient: jest.fn().mockImplementation(() => ({ search: jest.fn() }))
    }));
    jest.doMock('../config', () => ({
      modelConfig: { provider: 'ollama', ollama: { baseUrl: 'http://localhost', model: 'mock' }, openai: {} },
      searchConfig: { tavilyApiKey: 'fake-key', rateLimitDelayMs: 0 }
    }));
    jest.doMock('../flow/item-flow', () => ({
      runItemFlow
    }));
    jest.doMock('../../db', () => ({
      db: { transaction: (fn: unknown) => fn, prepare: jest.fn(() => ({ all: jest.fn(() => []) })) } as unknown,
      getItem,
      getAgenticRun: jest.fn(),
      updateAgenticRunStatus: { run: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      persistItemWithinTransaction: jest.fn(),
      logEvent: jest.fn(),
      getAgenticRequestLog,
      saveAgenticRequestPayload: jest.fn(),
      markAgenticRequestNotificationSuccess: jest.fn(),
      markAgenticRequestNotificationFailure: jest.fn()
    }));
    jest.doMock(
      '@langchain/ollama',
      () => ({
        ChatOllama: class {
          public async invoke() {
            return { content: null };
          }
        }
      }),
      { virtual: true }
    );

    await jest.isolateModulesAsync(async () => {
      const { AgenticModelInvoker } = await import('../invoker');
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const invoker = new AgenticModelInvoker({ logger });

      const result = await invoker.invoke({
        itemId: 'I-123-0001',
        searchQuery: 'Lookup Query',
        context: 'unit-test',
        review: null,
        requestId: ' request-merge '
      });

      expect(result).toEqual({ ok: true, message: 'ok' });
      expect(getAgenticRequestLog).toHaveBeenCalledWith('request-merge');
      expect(runItemFlow).toHaveBeenCalledTimes(1);
      const [payload] = runItemFlow.mock.calls[0];
      expect(payload.target.Artikelbeschreibung).toBe('User Description');
      expect(payload.target.Kurzbeschreibung).toBe('User Short');
      expect(payload.target.Artikel_Nummer).toBe('LOCK-42');
      expect(payload.target.__locked).toEqual(['Artikel_Nummer']);
      // TODO(agent): Extend Langtext serialization coverage when additional item fields require sanitization.
      expect(payload.target.Langtext).toBe('{"short":"Base Long","extra":"5"}');
    });
  });

  it('serializes Langtext overrides from saved request payloads', async () => {
    const runItemFlow = jest.fn().mockResolvedValue({ status: 'completed', summary: 'ok' });
    const requestPayload = {
      target: {
        Artikel_Nummer: 'OVERRIDE-99',
        Langtext: { short: 'User Long', details: 7, nullish: null }
      }
    };
    const getAgenticRequestLog = jest.fn(() => ({ PayloadJson: JSON.stringify(requestPayload) }));
    const getItem = {
      get: jest.fn(() => ({
        ItemUUID: 'I-456-0001',
        Artikelbeschreibung: 'Base Description',
        Verkaufspreis: 220,
        Kurzbeschreibung: 'Base Short',
        Langtext: { base: 'long' },
        Hersteller: 'Base Maker',
        Länge_mm: null,
        Breite_mm: null,
        Höhe_mm: null,
        Gewicht_kg: null
      }))
    };

    jest.doMock('../tools/tavily-client', () => ({
      TavilySearchClient: jest.fn().mockImplementation(() => ({ search: jest.fn() }))
    }));
    jest.doMock('../config', () => ({
      modelConfig: { provider: 'ollama', ollama: { baseUrl: 'http://localhost', model: 'mock' }, openai: {} },
      searchConfig: { tavilyApiKey: 'fake-key', rateLimitDelayMs: 0 }
    }));
    jest.doMock('../flow/item-flow', () => ({
      runItemFlow
    }));
    jest.doMock('../../db', () => ({
      db: { transaction: (fn: unknown) => fn, prepare: jest.fn(() => ({ all: jest.fn(() => []) })) } as unknown,
      getItem,
      getAgenticRun: jest.fn(),
      updateAgenticRunStatus: { run: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      persistItemWithinTransaction: jest.fn(),
      logEvent: jest.fn(),
      getAgenticRequestLog,
      saveAgenticRequestPayload: jest.fn(),
      markAgenticRequestNotificationSuccess: jest.fn(),
      markAgenticRequestNotificationFailure: jest.fn()
    }));
    jest.doMock(
      '@langchain/ollama',
      () => ({
        ChatOllama: class {
          public async invoke() {
            return { content: null };
          }
        }
      }),
      { virtual: true }
    );

    await jest.isolateModulesAsync(async () => {
      const { AgenticModelInvoker } = await import('../invoker');
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const invoker = new AgenticModelInvoker({ logger });

      const result = await invoker.invoke({
        itemId: 'I-456-0001',
        searchQuery: 'Langtext Override Query',
        context: 'unit-test',
        review: null,
        requestId: ' request-langtext '
      });

      expect(result).toEqual({ ok: true, message: 'ok' });
      expect(getAgenticRequestLog).toHaveBeenCalledWith('request-langtext');
      expect(runItemFlow).toHaveBeenCalledTimes(1);
      const [payload] = runItemFlow.mock.calls[0];
      // TODO(agent): Broaden override sanitization checks as new Langtext payload shapes emerge.
      expect(typeof payload.target.Langtext).toBe('string');
      expect(JSON.parse(payload.target.Langtext as string)).toEqual({
        short: 'User Long',
        details: '7'
      });
      expect(payload.target.Artikel_Nummer).toBe('OVERRIDE-99');
    });
  });

  it('composes review notes with missing and unneeded spec directives', async () => {
    const runItemFlow = jest.fn().mockResolvedValue({ status: 'completed', summary: 'ok' });
    const getItem = {
      get: jest.fn(() => ({
        ItemUUID: 'I-789-0001',
        Artikelbeschreibung: 'Base Description',
        Verkaufspreis: 220,
        Kurzbeschreibung: 'Base Short',
        Langtext: { base: 'long' },
        Hersteller: 'Base Maker',
        Länge_mm: null,
        Breite_mm: null,
        Höhe_mm: null,
        Gewicht_kg: null
      }))
    };

    jest.doMock('../tools/tavily-client', () => ({
      TavilySearchClient: jest.fn().mockImplementation(() => ({ search: jest.fn() }))
    }));
    jest.doMock('../config', () => ({
      modelConfig: { provider: 'ollama', ollama: { baseUrl: 'http://localhost', model: 'mock' }, openai: {} },
      searchConfig: { tavilyApiKey: 'fake-key', rateLimitDelayMs: 0 }
    }));
    jest.doMock('../flow/item-flow', () => ({
      runItemFlow
    }));
    jest.doMock('../../db', () => ({
      db: { transaction: (fn: unknown) => fn, prepare: jest.fn(() => ({ all: jest.fn(() => []) })) } as unknown,
      getItem,
      getAgenticRun: jest.fn(),
      updateAgenticRunStatus: { run: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      persistItemWithinTransaction: jest.fn(),
      logEvent: jest.fn(),
      getAgenticRequestLog: jest.fn(),
      saveAgenticRequestPayload: jest.fn(),
      markAgenticRequestNotificationSuccess: jest.fn(),
      markAgenticRequestNotificationFailure: jest.fn()
    }));
    jest.doMock(
      '@langchain/ollama',
      () => ({
        ChatOllama: class {
          public async invoke() {
            return { content: null };
          }
        }
      }),
      { virtual: true }
    );

    await jest.isolateModulesAsync(async () => {
      const { AgenticModelInvoker } = await import('../invoker');
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const invoker = new AgenticModelInvoker({ logger });

      const result = await invoker.invoke({
        itemId: 'I-789-0001',
        searchQuery: 'Review directives query',
        context: 'unit-test',
        review: {
          notes: 'Please double check details',
          missing_spec: ['Gewicht_kg', '  Höhe_mm  ', '', 'Gewicht_kg'],
          unneeded_spec: ['PlaceholderField', 'Ausstattung', 'PlaceholderField']
        },
        requestId: null
      });

      expect(result).toEqual({ ok: true, message: 'ok' });
      expect(runItemFlow).toHaveBeenCalledTimes(1);
      const [payload] = runItemFlow.mock.calls[0];
      expect(payload.reviewNotes).toContain('Please double check details');
      expect(payload.reviewNotes).toContain('Missing spec fields to prioritize: Gewicht_kg, Höhe_mm.');
      expect(payload.reviewNotes).toContain('Spec fields to remove if present: Ausstattung, PlaceholderField.');
    });
  });
});
