import { Op, OpResult } from './types';

export const name = 'validate';

export const apply: Op['apply'] = (row) => {
  try {
    console.log('[validate] validating row', row);
    const errors: string[] = [];
    if (!row.itemUUID) {
      console.warn('[validate] ItemUUID missing prior to importer minting', {
        artikelNummer: typeof row['Artikel-Nummer'] === 'string' ? row['Artikel-Nummer'].trim() : null,
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
