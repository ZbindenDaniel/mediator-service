// TODO(agent): Revisit Artikelnummer validation rules once upstream partner formatting is finalized.
// ItemUUIDs now use the Artikelnummer-based format: I.<Artikelnummer>-####. Legacy date-based IDs use I-<ddmmyy>-####.
const ITEM_ID_PREFIX = 'I.';
const LEGACY_ITEM_ID_PREFIX = 'I-';
const ITEM_ID_SEQUENCE_WIDTH = 4;

type MaybePromise<T> = T | Promise<T>;

export interface ItemIdGenerationDependencies {
  prefix?: string | null;
  now?: () => Date;
  getMaxItemId?: (params: { pattern: string; sequenceStartIndex: number }) => MaybePromise<{ ItemUUID: string } | null | undefined>;
}

export function formatItemIdDateSegment(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${day}${month}${year}`;
}

export function parseSequentialItemUUID(
  value: string,
  prefix?: string | string[] | null
):
  | { kind: 'artikelnummer'; prefix: string; artikelNummer: string; sequence: number }
  | { kind: 'date'; prefix: string; dateSegment: string; sequence: number }
  | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const prefixCandidates = (() => {
    if (prefix === null) {
      return [''];
    }
    if (Array.isArray(prefix)) {
      return prefix;
    }
    if (typeof prefix === 'string') {
      return [prefix];
    }
    return [ITEM_ID_PREFIX, LEGACY_ITEM_ID_PREFIX];
  })();

  for (const candidatePrefix of prefixCandidates) {
    if (candidatePrefix && !value.startsWith(candidatePrefix)) {
      continue;
    }

    const remainder = candidatePrefix ? value.slice(candidatePrefix.length) : value;
    if (candidatePrefix === LEGACY_ITEM_ID_PREFIX) {
      const match = remainder.match(/^(\d{6})-(\d{4})$/);
      if (!match) {
        continue;
      }
      const sequence = Number.parseInt(match[2], 10);
      if (!Number.isFinite(sequence)) {
        continue;
      }
      return { kind: 'date', prefix: candidatePrefix, dateSegment: match[1], sequence };
    }

    const artikelMatch = remainder.match(/^([^-]+)-(\d{4})$/);
    if (artikelMatch) {
      const sequence = Number.parseInt(artikelMatch[2], 10);
      if (!Number.isFinite(sequence)) {
        continue;
      }
      return { kind: 'artikelnummer', prefix: candidatePrefix, artikelNummer: artikelMatch[1], sequence };
    }

    const legacyMatch = remainder.match(/^(\d{6})-(\d{4})$/);
    if (!legacyMatch) {
      continue;
    }
    const legacySequence = Number.parseInt(legacyMatch[2], 10);
    if (!Number.isFinite(legacySequence)) {
      continue;
    }
    return { kind: 'date', prefix: candidatePrefix, dateSegment: legacyMatch[1], sequence: legacySequence };
  }

  return null;
}

export async function generateItemUUID(
  artikelNummer: string | null | undefined,
  dependencies: ItemIdGenerationDependencies = {},
  logger: Pick<Console, 'info' | 'warn' | 'error'> = console
): Promise<string> {
  const prefix = dependencies.prefix === null ? '' : dependencies.prefix ?? ITEM_ID_PREFIX;
  const normalizedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!normalizedArtikelNummer) {
    logger.error?.('[item-ids] Missing Artikel_Nummer for ItemUUID generation', {
      provided: artikelNummer
    });
    throw new Error('Missing Artikel_Nummer for ItemUUID generation');
  }

  if (normalizedArtikelNummer.includes('-')) {
    logger.error?.('[item-ids] Invalid Artikel_Nummer format for ItemUUID generation', {
      provided: artikelNummer
    });
    throw new Error('Invalid Artikel_Nummer for ItemUUID generation');
  }

  try {
    const now = dependencies.now ? dependencies.now() : new Date();
    if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
      logger.warn?.('[item-ids] Invalid date resolved for ItemUUID generation; defaulting to current time', {
        provided: now
      });
    }
  } catch (error) {
    logger.error?.('[item-ids] Failed to resolve timestamp for ItemUUID generation', { error });
  }

  let previousSequence = 0;
  if (dependencies.getMaxItemId) {
    try {
      const baseSegment = `${prefix}${normalizedArtikelNummer}`;
      const result = await dependencies.getMaxItemId({
        pattern: `${baseSegment}-%`,
        sequenceStartIndex: baseSegment.length + 2
      });
      const candidate = result?.ItemUUID;
      if (typeof candidate === 'string') {
        const parsed = parseSequentialItemUUID(candidate, [prefix, LEGACY_ITEM_ID_PREFIX]);
        if (parsed?.kind === 'artikelnummer' && parsed.artikelNummer === normalizedArtikelNummer) {
          previousSequence = parsed.sequence;
        } else if (!parsed) {
          logger.warn?.('[item-ids] Ignoring non-sequential ItemUUID while generating next identifier', {
            ItemUUID: candidate
          });
        } else {
          logger.warn?.('[item-ids] Ignoring mismatched ItemUUID while generating next identifier', {
            ItemUUID: candidate,
            expectedArtikelNummer: normalizedArtikelNummer
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
  return `${prefix}${normalizedArtikelNummer}-${sequenceSegment}`;
}

export const __TESTING__ = {
  ITEM_ID_PREFIX,
  LEGACY_ITEM_ID_PREFIX,
  ITEM_ID_SEQUENCE_WIDTH,
  formatItemIdDateSegment,
  parseSequentialItemUUID
};
