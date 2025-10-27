const ITEM_ID_PREFIX = 'I-';
const ITEM_ID_SUFFIX_WIDTH = 4;

export interface ItemIdDependencies {
  getMaxItemId: { get: () => { ItemUUID: string } | undefined };
}

export interface ItemIdGenerationOptions {
  now?: Date;
}

function formatDateSegment(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${day}${month}${year}`;
}

function nextSuffixFromPrevious(
  previousId: string,
  logger: Pick<Console, 'info' | 'warn' | 'error'>
): number | null {
  try {
    const match = previousId.match(/^I-\d{6}-(\d{4})$/);
    if (!match) {
      logger.warn?.('[item-ids] Unexpected ItemUUID format encountered during sequencing', { previousId });
      return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed)) {
      logger.warn?.('[item-ids] Failed to parse numeric suffix from ItemUUID', { previousId, suffix: match[1] });
      return null;
    }

    return parsed + 1;
  } catch (error) {
    logger.error?.('[item-ids] Error while parsing previous ItemUUID', { previousId, error });
    throw error;
  }
}

export function generateItemUUID(
  deps: ItemIdDependencies,
  options: ItemIdGenerationOptions = {},
  logger: Pick<Console, 'info' | 'warn' | 'error'> = console
): string {
  const now = options.now ?? new Date();
  let nextSuffix = 1;

  try {
    const latest = deps.getMaxItemId?.get();
    if (latest?.ItemUUID) {
      const computed = nextSuffixFromPrevious(latest.ItemUUID, logger);
      if (computed && Number.isFinite(computed) && computed > 0) {
        nextSuffix = computed;
      } else {
        logger.info?.('[item-ids] Resetting ItemUUID suffix due to unparsable previous value', {
          previousId: latest.ItemUUID
        });
      }
    }
  } catch (error) {
    logger.error?.('[item-ids] Failed to resolve latest ItemUUID from database', { error });
    throw error;
  }

  if (nextSuffix > 10 ** ITEM_ID_SUFFIX_WIDTH - 1) {
    const exhaustionError = new Error('ItemUUID suffix exhausted');
    logger.error?.('[item-ids] Exhausted ItemUUID suffix range', {
      suffixWidth: ITEM_ID_SUFFIX_WIDTH,
      attemptedSuffix: nextSuffix
    });
    throw exhaustionError;
  }

  try {
    const suffix = String(nextSuffix).padStart(ITEM_ID_SUFFIX_WIDTH, '0');
    const dateSegment = formatDateSegment(now);
    return `${ITEM_ID_PREFIX}${dateSegment}-${suffix}`;
  } catch (error) {
    logger.error?.('[item-ids] Failed to format new ItemUUID', { error, nextSuffix });
    throw error;
  }
}

export const __TESTING__ = {
  ITEM_ID_PREFIX,
  ITEM_ID_SUFFIX_WIDTH,
  formatDateSegment,
  nextSuffixFromPrevious
};
