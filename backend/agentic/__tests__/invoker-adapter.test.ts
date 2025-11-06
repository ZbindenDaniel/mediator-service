import type { ChatModel } from '../flow/item-flow-extraction';

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
