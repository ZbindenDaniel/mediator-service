import crypto from 'crypto';

const ITEM_ID_PREFIX = 'I-';

export function generateItemUUID(logger: Pick<Console, 'error'> = console): string {
  try {
    const raw = crypto.randomUUID();
    return `${ITEM_ID_PREFIX}${raw}`;
  } catch (primaryError) {
    try {
      logger.error?.('[item-ids] randomUUID unavailable, falling back to randomBytes', { error: primaryError });
      const fallback = crypto.randomBytes(16).toString('hex');
      return `${ITEM_ID_PREFIX}${fallback}`;
    } catch (secondaryError) {
      logger.error?.('[item-ids] Failed to generate fallback ItemUUID via randomBytes', {
        primaryError,
        secondaryError
      });
      throw secondaryError;
    }
  }
}

export const __TESTING__ = {
  ITEM_ID_PREFIX
};
