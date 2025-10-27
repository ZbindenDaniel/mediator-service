const ITEM_ID_PREFIX = 'I-';
const ITEM_ID_SEQUENCE_WIDTH = 4;

type MaybePromise<T> = T | Promise<T>;

export interface ItemIdGenerationDependencies {
  prefix?: string | null;
  now?: () => Date;
  getMaxItemId?: () => MaybePromise<{ ItemUUID: string } | null | undefined>;
}

export function formatItemIdDateSegment(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${day}${month}${year}`;
}

export function parseSequentialItemUUID(
  value: string,
  prefix: string = ITEM_ID_PREFIX
): { dateSegment: string; sequence: number } | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const normalizedPrefix = prefix === null ? '' : prefix ?? ITEM_ID_PREFIX;
  if (normalizedPrefix && !value.startsWith(normalizedPrefix)) {
    return null;
  }

  const remainder = normalizedPrefix ? value.slice(normalizedPrefix.length) : value;
  const match = remainder.match(/^(\d{6})-(\d{4})$/);
  if (!match) {
    return null;
  }

  const sequence = parseInt(match[2], 10);
  if (!Number.isFinite(sequence)) {
    return null;
  }

  return { dateSegment: match[1], sequence };
}

export async function generateItemUUID(
  dependencies: ItemIdGenerationDependencies = {},
  logger: Pick<Console, 'info' | 'warn' | 'error'> = console
): Promise<string> {
  const prefix = dependencies.prefix === null ? '' : dependencies.prefix ?? ITEM_ID_PREFIX;

  let now: Date;
  try {
    now = dependencies.now ? dependencies.now() : new Date();
  } catch (error) {
    logger.error?.('[item-ids] Failed to resolve timestamp for ItemUUID generation', { error });
    now = new Date();
  }

  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
    logger.warn?.('[item-ids] Invalid date resolved for ItemUUID generation; defaulting to current time', {
      provided: now
    });
    now = new Date();
  }

  const dateSegment = formatItemIdDateSegment(now);

  let previousSequence = 0;
  if (dependencies.getMaxItemId) {
    try {
      const result = await dependencies.getMaxItemId();
      const candidate = result?.ItemUUID;
      if (typeof candidate === 'string') {
        const parsed = parseSequentialItemUUID(candidate, prefix);
        if (parsed && parsed.dateSegment === dateSegment) {
          previousSequence = parsed.sequence;
        } else if (!parsed) {
          logger.warn?.('[item-ids] Ignoring non-sequential ItemUUID while generating next identifier', {
            ItemUUID: candidate
          });
        }
      }
    } catch (error) {
      logger.error?.('[item-ids] Failed to query latest ItemUUID for sequence generation', { error });
    }
  } else {
    logger.warn?.('[item-ids] Missing getMaxItemId dependency; starting new ItemUUID sequence');
  }

  const nextSequence = previousSequence + 1;
  const sequenceSegment = String(nextSequence).padStart(ITEM_ID_SEQUENCE_WIDTH, '0');
  return `${prefix}${dateSegment}-${sequenceSegment}`;
}

export const __TESTING__ = {
  ITEM_ID_PREFIX,
  ITEM_ID_SEQUENCE_WIDTH,
  formatItemIdDateSegment,
  parseSequentialItemUUID
};
