import type { Item } from '../models';
import { confirmItemRelocationIfNecessary } from '../frontend/src/components/AddItemToBoxDialog';
import { dialogService } from '../frontend/src/components/dialog';

function createItem(overrides: Partial<Item>): Item {
  return {
    ItemUUID: 'I-TEST',
    BoxID: null,
    UpdatedAt: new Date(),
    ...overrides
  } as Item;
}

describe('confirmItemRelocationIfNecessary', () => {
  const originalConfirm = dialogService.confirm.bind(dialogService);

  afterEach(() => {
    (dialogService as unknown as { confirm: typeof dialogService.confirm }).confirm = originalConfirm;
  });

  test('skips confirmation when item is not in a different box', async () => {
    let callCount = 0;
    (dialogService as unknown as { confirm: typeof dialogService.confirm }).confirm = async () => {
      callCount += 1;
      return true;
    };

    const item = createItem({ BoxID: null });
    const result = await confirmItemRelocationIfNecessary(item, 'BOX-123');

    expect(result).toBe(true);
    expect(callCount).toBe(0);
  });

  test('returns dialog decision when relocating from another box', async () => {
    let callCount = 0;
    (dialogService as unknown as { confirm: typeof dialogService.confirm }).confirm = async () => {
      callCount += 1;
      return false;
    };

    const item = createItem({ BoxID: 'BOX-OLD' });
    const result = await confirmItemRelocationIfNecessary(item, 'BOX-NEW');

    expect(result).toBe(false);
    expect(callCount).toBe(1);
  });

  test('propagates dialog errors to the caller', async () => {
    const dialogError = new Error('confirm failed');
    (dialogService as unknown as { confirm: typeof dialogService.confirm }).confirm = async () => {
      throw dialogError;
    };

    const item = createItem({ BoxID: 'BOX-OLD' });
    let caught: unknown = null;

    try {
      await confirmItemRelocationIfNecessary(item, 'BOX-NEW');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(dialogError);
  });
});
