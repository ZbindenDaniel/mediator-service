import { jest } from '@jest/globals';

describe('runItemFlow result dispatch', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('dispatches agentic result via the provided handler', async () => {
    const runs = new Map<string, string>([['item-123', 'queued']]);
    const applyAgenticResult = jest.fn((payload: any) => {
      runs.set(payload.itemId, payload.status);
    });
    const markNotificationSuccess = jest.fn();
    const markNotificationFailure = jest.fn();
    const saveRequestPayload = jest.fn();

    await (jest as any).isolateModulesAsync(async () => {
      jest.doMock('../config', () => ({
        agentActorId: 'test-agent'
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
          saveRequestPayload,
          markNotificationSuccess,
          markNotificationFailure
        }
      );

      expect(payload.status).toBe('completed');
      expect(applyAgenticResult).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-123' }));
      expect(runs.get('item-123')).toBe('completed');
      expect(saveRequestPayload).toHaveBeenCalledWith('item-123', expect.any(Object));
      expect(markNotificationSuccess).toHaveBeenCalledWith('item-123');
      expect(markNotificationFailure).not.toHaveBeenCalled();
    });
  });

  test('records notification failure when handler rejects', async () => {
    const applyAgenticResult = jest.fn().mockRejectedValue(new Error('dispatch failed'));
    const markNotificationSuccess = jest.fn();
    const markNotificationFailure = jest.fn();
    const saveRequestPayload = jest.fn();

    await (jest as any).isolateModulesAsync(async () => {
      jest.doMock('../config', () => ({
        agentActorId: 'test-agent'
      }));
      const resolveShopwareMatch = jest.fn().mockResolvedValue({
        finalData: { itemUUid: 'item-xyz', Artikelbeschreibung: 'Example item' },
        summary: 'Shopware match',
        reviewNotes: null,
        reviewedBy: 'shopware-agent',
        sources: []
      });
      jest.doMock('../flow/item-flow-shopware', () => ({ resolveShopwareMatch }));

      const { runItemFlow } = await import('../flow/item-flow');

      await expect(
        runItemFlow(
          {
            target: { itemUUid: 'item-xyz', Artikelbeschreibung: 'Example item' },
            id: 'item-xyz',
            search: 'Example item'
          },
          {
            llm: { invoke: jest.fn() } as any,
            logger: console,
            searchInvoker: jest.fn(),
            applyAgenticResult,
            saveRequestPayload,
            markNotificationSuccess,
            markNotificationFailure
          }
        )
      ).rejects.toThrow('dispatch failed');

      expect(markNotificationSuccess).not.toHaveBeenCalled();
      expect(markNotificationFailure).toHaveBeenCalledWith('item-xyz', 'dispatch failed');
    });
  });
});
