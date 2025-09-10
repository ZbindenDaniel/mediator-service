import { Op } from './types';

export const name = 'map-wms';

export const apply: Op['apply'] = (row, ctx) => {
  try {
    ctx.log('[map-wms] processing', row);
    row['Artikel-Nummer'] = (row['Artikel-Nummer'] || '').trim();
    if (!row.WmsLink && row['Artikel-Nummer']) {
      row.WmsLink = `https://wms.example/items/${encodeURIComponent(row['Artikel-Nummer'])}`;
    }
    return { ok: true, row };
  } catch (err) {
    console.error('[map-wms] failed', err);
    return { ok: false, errors: [String(err)] };
  }
};

export default { name, apply } satisfies Op;
