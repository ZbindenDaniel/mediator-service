import { randomUUID } from 'crypto';

const ITEM_ID_PREFIX = 'I-';

export interface ItemIdGenerationOptions {
  prefix?: string | null;
}

export function generateItemUUID(
  options: ItemIdGenerationOptions = {},
  logger: Pick<Console, 'info' | 'warn' | 'error'> = console
): string {
  const prefix = options.prefix === null ? '' : options.prefix ?? ITEM_ID_PREFIX;

  try {
    const id = randomUUID();
    return prefix ? `${prefix}${id}` : id;
  } catch (error) {
    logger.error?.('[item-ids] Failed to generate random ItemUUID', { error });
    throw error;
  }
}

export const __TESTING__ = {
  ITEM_ID_PREFIX
};
