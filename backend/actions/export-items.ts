import type { IncomingMessage, ServerResponse } from 'http';
import { PUBLIC_ORIGIN } from '../config';
import { ItemEinheit, isItemEinheit } from '../../models';
import type { Action } from './index';

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

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;

function toCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function resolveExportValue(column: string, rawRow: Record<string, unknown>): unknown {
  const field = fieldMap[column];
  const value = rawRow[field];
  if (column !== 'Einheit') {
    return value;
  }
  try {
    if (isItemEinheit(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (isItemEinheit(trimmed)) {
        return trimmed;
      }
      if (trimmed.length > 0) {
        console.warn('[export-items] Invalid Einheit value encountered during export, falling back to default.', {
          provided: trimmed
        });
      }
    } else if (value !== null && value !== undefined) {
      console.warn('[export-items] Unexpected Einheit type encountered during export, falling back to default.', {
        providedType: typeof value
      });
    }
  } catch (error) {
    console.error('[export-items] Failed to normalize Einheit for export, using default.', error);
  }
  return DEFAULT_EINHEIT;
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
      log(items, actor);
      const header = columns.join(',');
      const lines = items.map((row: any) =>
        columns
          .map((column) => {
            const resolvedValue = resolveExportValue(column, row);
            return toCsvValue(resolvedValue);
          })
          .join(',')
      );
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

