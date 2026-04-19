import { ItemEinheit } from '../../../../models';
import {
  hasAutoPrintTargetMismatch,
  parseCreateItemResponse,
  resolveAutoPrintTargets
} from '../ItemCreate';

describe('ItemCreate auto-print helpers', () => {
  it('resolves bulk mode to a single label target', () => {
    const targets = resolveAutoPrintTargets({
      createdItem: { ItemUUID: 'item-primary' } as any,
      responseItems: [{ ItemUUID: 'item-primary' }, { ItemUUID: 'item-secondary' }],
      einheit: ItemEinheit.Menge
    });

    expect(targets).toEqual({
      mode: 'bulk',
      itemIds: ['item-primary']
    });
  });

  it('resolves instance mode to the full list of item ids', () => {
    const targets = resolveAutoPrintTargets({
      createdItem: { ItemUUID: 'item-primary' } as any,
      responseItems: [
        { ItemUUID: 'item-primary' },
        { ItemUUID: 'item-secondary' },
        { ItemUUID: 'item-secondary' }
      ],
      einheit: ItemEinheit.Stk
    });

    expect(targets.mode).toBe('instance');
    expect(targets.itemIds).toEqual(['item-primary', 'item-secondary']);
  });

  it('parses response payload and preserves backend dispatch flag', () => {
    const parsed = parseCreateItemResponse({
      item: { ItemUUID: 'item-primary', Artikel_Nummer: 'A-100' },
      items: [{ ItemUUID: 'item-primary' }, { ItemUUID: 'item-secondary' }],
      createdCount: 2,
      agenticTriggerDispatched: true
    });

    expect(parsed.createdItem?.ItemUUID).toBe('item-primary');
    expect(parsed.responseItems).toHaveLength(2);
    expect(parsed.createdCount).toBe(2);
    expect(parsed.backendDispatched).toBe(true);
  });

  it('parses 3-instance Stk response and exposes all UUIDs for dialog buttons', () => {
    const parsed = parseCreateItemResponse({
      item: { ItemUUID: 'stk-1', Artikel_Nummer: 'A-200' },
      items: [{ ItemUUID: 'stk-1' }, { ItemUUID: 'stk-2' }, { ItemUUID: 'stk-3' }],
      createdCount: 3,
      agenticTriggerDispatched: false
    });

    expect(parsed.responseItems).toHaveLength(3);
    expect(parsed.createdCount).toBe(3);

    const allPrintItemIds = parsed.responseItems
      .map((i) => (typeof i?.ItemUUID === 'string' ? i.ItemUUID.trim() : ''))
      .filter(Boolean);

    expect(allPrintItemIds).toEqual(['stk-1', 'stk-2', 'stk-3']);
  });

  it('reports mismatch warning path for instance printing', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const hasMismatch = hasAutoPrintTargetMismatch(3, 2, 'instance', ItemEinheit.Stk);

      expect(hasMismatch).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        'Auto-print target count mismatch detected; continuing with resolved item ids.',
        expect.objectContaining({
          createdCount: 3,
          resolvedIds: 2,
          mode: 'instance',
          einheit: ItemEinheit.Stk
        })
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
