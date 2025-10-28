import type { Logger } from '../../utils/logger';
import type { ItemRef } from '../../../models';

type BranchLookup = { get: () => { BoxID?: string; ItemUUID?: string } | undefined };

export interface BranchingContext {
  getMaxBoxId: BranchLookup;
  getMaxItemId: BranchLookup;
  logger: Logger;
}

export interface BranchingInputs {
  now: Date;
  requestedBoxId?: string | null;
  requestedItemId?: string | null;
}

export interface BranchingResult {
  reference: ItemRef;
  now: Date;
  isoNow: string;
}

function nextSequence(rawId: string | undefined, pattern: RegExp, logger: Logger, scope: string): number {
  if (!rawId) return 0;
  const match = rawId.match(pattern);
  if (!match) {
    logger.warn('Failed to parse sequence for identifier', { scope, identifier: rawId });
    return 0;
  }
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function prepareNewItemCreationBranch(
  inputs: BranchingInputs,
  ctx: BranchingContext
): BranchingResult {
  const { now, requestedBoxId, requestedItemId } = inputs;
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);

  const providedBox = (requestedBoxId || '').trim();
  const providedItem = (requestedItemId || '').trim();

  let boxId = providedBox;
  if (!boxId) {
    const lastBox = ctx.getMaxBoxId.get();
    const next = nextSequence(lastBox?.BoxID, /^B-\d{6}-(\d+)$/, ctx.logger, 'box');
    boxId = `B-${dd}${mm}${yy}-${String(next + 1).padStart(4, '0')}`;
  }

  let itemId = providedItem;
  if (!itemId) {
    const lastItem = ctx.getMaxItemId.get();
    const next = nextSequence(lastItem?.ItemUUID, /^I-\d{6}-(\d+)$/, ctx.logger, 'item');
    itemId = `I-${dd}${mm}${yy}-${String(next + 1).padStart(4, '0')}`;
  }

  return {
    reference: { BoxID: boxId, ItemUUID: itemId },
    now,
    isoNow: now.toISOString()
  };
}
