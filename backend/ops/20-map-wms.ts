import { Op } from './types';

export const name = 'map-wms';

export const apply: Op['apply'] = (row, ctx) => {
  try {
    ctx.log('[map-wms] processing', row.MaterialNumber);
    row.MaterialNumber = (row.MaterialNumber || '').trim();
    if (!row.WmsLink && row.MaterialNumber) {
      row.WmsLink = `https://wms.example/items/${encodeURIComponent(row.MaterialNumber)}`;
    }
    return { ok: true, row };
  } catch (err) {
    console.error('[map-wms] failed', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
