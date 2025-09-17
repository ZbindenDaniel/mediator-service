import { Op } from './types';

export const name = 'queue-label';

export const apply: Op['apply'] = (row, ctx) => {
    return { ok: true, row }; // DO not print labels for now
  try {
    ctx.log('[queue-label] enqueuing', row);
    ctx.queueLabel(row.itemUUID);
    return { ok: true, row };
  } catch (err) {
    ctx.log('[queue-label] failed', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
