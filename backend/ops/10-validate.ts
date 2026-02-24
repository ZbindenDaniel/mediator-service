import { Op, OpResult } from './types';

export const name = 'validate';

export const apply: Op['apply'] = (row) => {
  try {
    console.log('[validate] validating row', row);
    const errors: string[] = [];

    let resolvedItemUUID: unknown = null;
    let uuidKeyVariant: 'itemUUID' | 'ItemUUID' | 'both' | 'none' = 'none';

    try {
      const hasLowerKey = Object.prototype.hasOwnProperty.call(row, 'itemUUID');
      const hasUpperKey = Object.prototype.hasOwnProperty.call(row, 'ItemUUID');

      if (hasLowerKey && hasUpperKey) uuidKeyVariant = 'both';
      else if (hasLowerKey) uuidKeyVariant = 'itemUUID';
      else if (hasUpperKey) uuidKeyVariant = 'ItemUUID';

      const lowerValue = hasLowerKey ? row.itemUUID : undefined;
      const upperValue = hasUpperKey ? (row as Record<string, unknown>).ItemUUID : undefined;

      resolvedItemUUID = lowerValue || upperValue;
    } catch (extractErr) {
      console.warn('[validate] failed to extract ItemUUID aliases prior to validation warning', {
        rowNumber: typeof row.rowNumber === 'number' ? row.rowNumber : null,
        artikelNummer:
          typeof row['Artikel-Nummer'] === 'string' ? row['Artikel-Nummer'].trim() : null,
        itemUUIDKeyVariant: uuidKeyVariant,
        error: String(extractErr),
      });
    }

    if (!resolvedItemUUID) {
      console.warn('[validate] ItemUUID missing prior to importer minting', {
        rowNumber: typeof row.rowNumber === 'number' ? row.rowNumber : null,
        artikelNummer: typeof row['Artikel-Nummer'] === 'string' ? row['Artikel-Nummer'].trim() : null,
        itemUUIDKeyVariant: uuidKeyVariant,
      });
    }

    // if (!row.BoxID) row.boxID =  //errors.push('BoxID missing');
    if (errors.length) return { ok: false, errors } as OpResult;
    return { ok: true, row } as OpResult;
  } catch (err) {
    console.error('[validate] unexpected error', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
