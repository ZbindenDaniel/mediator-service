import { Op, OpResult } from './types';

export const name = 'validate';

export const apply: Op['apply'] = (row) => {
  try {
    const errors: string[] = [];
    if (!row.ItemUUID) errors.push('ItemUUID missing');
    if (!row.BoxID) errors.push('BoxID missing');
    if (errors.length) return { ok: false, errors } as OpResult;
    return { ok: true, row } as OpResult;
  } catch (err) {
    console.error('[validate] unexpected error', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
