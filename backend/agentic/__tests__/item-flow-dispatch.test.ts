import { jest } from '@jest/globals';

describe('runItemFlow result dispatch', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('defaults to internal result handler when callback base url is missing', async () => {
    const runs = new Map<string, string>([['item-123', 'queued']]);
    const applyAgenticResult = jest.fn((payload: any) => {
      runs.set(payload.itemId, payload.status);
    });
    const markNotificationSuccess = jest.fn();
    const markNotificationFailure = jest.fn();
    const saveRequestPayload = jest.fn();
    const sendToExternal = jest.fn();

    await (jest as any).isolateModulesAsync(async () => {
      jest.doMock('../config', () => ({
        agentActorId: 'test-agent',
        callbackConfig: { baseUrl: undefined, sharedSecret: undefined }
      }));
      const resolveShopwareMatch = jest.fn().mockResolvedValue({
        finalData: { itemUUid: 'item-123', Artikelbeschreibung: 'Example item' },
        summary: 'Shopware match',
        reviewNotes: null,
        reviewedBy: 'shopware-agent',
        sources: []
      });
      jest.doMock('../flow/item-flow-shopware', () => ({ resolveShopwareMatch }));

      const { runItemFlow } = await import('../flow/item-flow');

      const payload = await runItemFlow(
        {
          target: { itemUUid: 'item-123', Artikelbeschreibung: 'Example item' },
          id: 'item-123',
          search: 'Example item'
        },
        {
          llm: { invoke: jest.fn() } as any,
          logger: console,
          searchInvoker: jest.fn(),
          applyAgenticResult: (result) => applyAgenticResult(result),
          sendToExternal,
          saveRequestPayload,
          markNotificationSuccess,
          markNotificationFailure
        }
      );

      expect(payload.status).toBe('completed');
      expect(applyAgenticResult).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-123' }));
      expect(sendToExternal).not.toHaveBeenCalled();
      expect(runs.get('item-123')).toBe('completed');
      expect(saveRequestPayload).toHaveBeenCalledWith('item-123', expect.any(Object));
      expect(markNotificationSuccess).toHaveBeenCalledWith('item-123');
      expect(markNotificationFailure).not.toHaveBeenCalled();
    });
  });

  test('uses external callback when callback base url is configured', async () => {
    const applyAgenticResult = jest.fn();
    const markNotificationSuccess = jest.fn();
    const markNotificationFailure = jest.fn();
    const saveRequestPayload = jest.fn();
    const sendToExternal = jest.fn().mockResolvedValue(undefined);

    await (jest as any).isolateModulesAsync(async () => {
      jest.doMock('../config', () => ({
        agentActorId: 'test-agent',
        callbackConfig: { baseUrl: 'https://example.com', sharedSecret: undefined }
      }));
      const resolveShopwareMatch = jest.fn().mockResolvedValue({
        finalData: { itemUUid: 'item-abc', Artikelbeschreibung: 'External item' },
        summary: 'Shopware match',
        reviewNotes: null,
        reviewedBy: 'shopware-agent',
        sources: []
      });
      jest.doMock('../flow/item-flow-shopware', () => ({ resolveShopwareMatch }));

      const { runItemFlow } = await import('../flow/item-flow');

      const payload = await runItemFlow(
        {
          target: { itemUUid: 'item-abc', Artikelbeschreibung: 'External item' },
          id: 'item-abc',
          search: 'External item'
        },
        {
          llm: { invoke: jest.fn() } as any,
          logger: console,
          searchInvoker: jest.fn(),
          applyAgenticResult,
          sendToExternal,
          saveRequestPayload,
          markNotificationSuccess,
          markNotificationFailure
        }
      );

      expect(payload.status).toBe('completed');
      expect(sendToExternal).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-abc' }));
      expect(applyAgenticResult).not.toHaveBeenCalled();
      expect(markNotificationSuccess).toHaveBeenCalledWith('item-abc');
      expect(markNotificationFailure).not.toHaveBeenCalled();
    });
  });
});
