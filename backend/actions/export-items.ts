import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import type { Action } from './index';
import { normalizeItemEinheit, type ItemEinheit } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const importFields = [
  'Datum erfasst',
  'Artikel-Nummer',
  'Grafikname(n)',
  'Artikelbeschreibung',
  'Auf_Lager',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge(mm)',
  'Breite(mm)',
  'Höhe(mm)',
  'Gewicht(kg)',
  'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Artikeltyp',
  'Einheit'
];

const extraFields = ['itemUUID', 'BoxID', 'Location', 'UpdatedAt'];
const columns = [...importFields, ...extraFields];

const fieldMap: Record<string, string> = {
  'Datum erfasst': 'Datum_erfasst',
  'Artikel-Nummer': 'Artikel_Nummer',
  'Grafikname(n)': 'Grafikname',
  'Artikelbeschreibung': 'Artikelbeschreibung',
  'Auf_Lager': 'Auf_Lager',
  'Verkaufspreis': 'Verkaufspreis',
  'Kurzbeschreibung': 'Kurzbeschreibung',
  'Langtext': 'Langtext',
  'Hersteller': 'Hersteller',
  'Länge(mm)': 'Länge_mm',
  'Breite(mm)': 'Breite_mm',
  'Höhe(mm)': 'Höhe_mm',
  'Gewicht(kg)': 'Gewicht_kg',
  'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)': 'Hauptkategorien_A',
  'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)': 'Unterkategorien_A',
  'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)': 'Hauptkategorien_B',
  'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)': 'Unterkategorien_B',
  'Veröffentlicht_Status': 'Veröffentlicht_Status',
  'Shopartikel': 'Shopartikel',
  'Artikeltyp': 'Artikeltyp',
  'Einheit': 'Einheit',
  itemUUID: 'ItemUUID',
  BoxID: 'BoxID',
  Location: 'Location',
  UpdatedAt: 'UpdatedAt'
};

function toCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function resolveExportEinheit(rawValue: unknown, context: { itemUUID: string }): ItemEinheit {
  const result = normalizeItemEinheit(rawValue);
  if (!result.reason) {
    return result.value;
  }

  const payload = {
    itemUUID: context.itemUUID,
    provided: rawValue,
    normalizedValue: result.value,
    normalizedFrom: result.normalizedFrom
  };

  if (result.reason === 'invalid' || result.reason === 'non-string') {
    console.warn('[export-items] Normalized invalid Einheit value during export', payload);
  } else {
    console.info('[export-items] Adjusted Einheit value during export', payload);
  }

  return result.value;
}

const action: Action = {
  key: 'export-items',
  label: 'Export items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/export/items' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url || '', PUBLIC_ORIGIN);
      const actor = (url.searchParams.get('actor') || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const createdAfter = url.searchParams.get('createdAfter');
      const updatedAfter = url.searchParams.get('updatedAfter');
      const items = ctx.listItemsForExport.all({
        createdAfter: createdAfter || null,
        updatedAfter: updatedAfter || null
      });
      const normalizedItems = items.map((row: any) => ({
        ...row,
        Einheit: resolveExportEinheit(row.Einheit, { itemUUID: row.ItemUUID })
      }));
      const log = ctx.db.transaction((rows: any[], a: string) => {
        for (const row of rows) {
          ctx.logEvent.run({
            Actor: a,
            EntityType: 'Item',
            EntityId: row.ItemUUID,
            Event: 'Exported',
            Meta: JSON.stringify({ createdAfter, updatedAfter })
          });
        }
      });
      log(normalizedItems, actor);
      const header = columns.join(',');
      const lines = normalizedItems.map((row: any) => columns.map((c) => toCsvValue(row[fieldMap[c]])).join(','));
      const csv = [header, ...lines].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csv);
    } catch (err) {
      console.error('Export items failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Export items API</p></div>'
};

export default action;

