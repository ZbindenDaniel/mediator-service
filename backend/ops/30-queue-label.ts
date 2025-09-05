import { Op } from './types';

export const name = 'queue-label';

export const apply: Op['apply'] = (row, ctx) => {
  try {
    ctx.log('[queue-label] enqueuing', row.ItemUUID);
    ctx.queueLabel(row.ItemUUID);
    return { ok: true, row };
  } catch (err) {
    ctx.log('[queue-label] failed', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
