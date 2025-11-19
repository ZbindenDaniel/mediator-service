import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { LANGTEXT_EXPORT_FORMAT, PUBLIC_ORIGIN } from '../config';
import { ItemEinheit, isItemEinheit } from '../../models';
import { serializeLangtextForExport } from '../lib/langtext';
import { MEDIA_DIR } from '../lib/media';
import { collectMediaAssets } from './save-item';
import { defineHttpAction } from './index';
import { collectMediaAssets } from './save-item';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// TODO(agent): Keep exporter metadata parity intact when partner CSV specs change.
// TODO(agent): Remove ImageNames fallback once disk-backed assets are guaranteed for exports.
// TODO(export-items): Keep this header order in sync with partner CSV specs tracked in docs when they change.
const partnerRequiredColumns = [
  'partnumber',
  'type_and_classific',
  'entrydate',
  'image_names',
  'description',
  'notes',
  'longdescription',
  'manufacturer',
  'length_mm',
  'width_mm',
  'height_mm',
  'weight_kg',
  'sellprice',
  'onhand',
  'published_status',
  'shoparticle',
  'unit',
  'ean',
  'cvar_categories_A1',
  'cvar_categories_A2',
  'cvar_categories_B1',
  'cvar_categories_B2'
] as const;

const metadataColumns = ['itemUUID', 'BoxID', 'Location', 'UpdatedAt'] as const;

const columns = [...partnerRequiredColumns, ...metadataColumns] as const;

// TODO(agent): Replace CSV-specific Langtext serialization once exports move to typed clients.
// TODO(langtext-export): Align CSV Langtext serialization with downstream channel requirements when available.

type ExportColumn = (typeof columns)[number];

const metadataColumnSet = new Set<ExportColumn>(metadataColumns as readonly ExportColumn[]);

const fieldMap: Record<ExportColumn, string | null> = {
  partnumber: 'Artikel_Nummer',
  type_and_classific: 'Artikeltyp',
  entrydate: 'Datum_erfasst',
  image_names: 'Grafikname',
  description: 'Artikelbeschreibung',
  notes: 'Kurzbeschreibung',
  longdescription: 'Langtext',
  manufacturer: 'Hersteller',
  length_mm: 'Länge_mm',
  width_mm: 'Breite_mm',
  height_mm: 'Höhe_mm',
  weight_kg: 'Gewicht_kg',
  sellprice: 'Verkaufspreis',
  onhand: 'Auf_Lager',
  published_status: 'Veröffentlicht_Status',
  shoparticle: 'Shopartikel',
  unit: 'Einheit',
  ean: null,
  cvar_categories_A1: 'Hauptkategorien_A',
  cvar_categories_A2: 'Unterkategorien_A',
  cvar_categories_B1: 'Hauptkategorien_B',
  cvar_categories_B2: 'Unterkategorien_B',
  itemUUID: 'ItemUUID',
  BoxID: 'BoxID',
  Location: 'Location',
  UpdatedAt: 'UpdatedAt'
};

const missingFieldWarnings = new Set<ExportColumn>();
const missingMetadataValueWarnings = new Set<ExportColumn>();

const DEFAULT_EINHEIT: ItemEinheit = ItemEinheit.Stk;
const MEDIA_PREFIX = '/media/';

function filterExistingMediaAssets(assets: string[]): string[] {
  const filtered: string[] = [];
  for (const asset of assets) {
    if (typeof asset !== 'string') {
      continue;
    }
    const trimmed = asset.trim();
    if (!trimmed) {
      continue;
    }
    if (!trimmed.startsWith(MEDIA_PREFIX)) {
      filtered.push(trimmed);
      continue;
    }
    const relative = trimmed.slice(MEDIA_PREFIX.length);
    const absolute = path.join(MEDIA_DIR, relative);
    if (!absolute.startsWith(MEDIA_DIR)) {
      continue;
    }
    try {
      if (fs.existsSync(absolute)) {
        filtered.push(trimmed);
      }
    } catch (error) {
      console.error('[export-items] Failed to verify media asset existence for export', {
        asset: trimmed,
        error,
      });
    }
  }
  return filtered;
}

function toCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function logMissingMetadataValue(
  column: ExportColumn,
  field: string,
  rawRow: Record<string, unknown>
): void {
  if (missingMetadataValueWarnings.has(column)) {
    return;
  }
  missingMetadataValueWarnings.add(column);
  const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
  try {
    console.warn('[export-items] Missing metadata value for export column; emitting blank string.', {
      column,
      field,
      itemUUID
    });
  } catch (loggingError) {
    console.error('[export-items] Failed to log missing metadata value warning', {
      column,
      field,
      loggingError
    });
  }
}

// TODO(agent): Revisit CSV media derivation when asset manifests are queryable via API.
function resolveExportValue(column: ExportColumn, rawRow: Record<string, unknown>): unknown {
  const field = fieldMap[column];

  if (!field) {
    if (!missingFieldWarnings.has(column)) {
      missingFieldWarnings.add(column);
      try {
        console.warn('[export-items] Missing field mapping for export column; emitting blank value.', { column });
      } catch (loggingError) {
        console.error('[export-items] Failed to log missing field mapping warning', { column, loggingError });
      }
    }
    return '';
  }

  const value = rawRow[field];

  if (column === 'image_names') {
    const fallbackValue = value;
    const grafikname = typeof value === 'string' ? value : null;
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;

    if (!itemUUID) {
      console.warn('[export-items] Missing ItemUUID for media enumeration, falling back to original Grafikname.');
      return fallbackValue;
    }

    try {
      const mediaAssets = collectMediaAssets(itemUUID, grafikname, artikelNummer);
      if (Array.isArray(mediaAssets) && mediaAssets.length > 0) {
        return mediaAssets.join('|');
      }
      console.info('[export-items] No media assets discovered for export row, falling back to Grafikname.', {
        itemUUID,
        artikelNummer
      });
    } catch (error) {
      console.error('[export-items] Failed to enumerate media assets for export row, falling back to Grafikname.', {
        itemUUID,
        artikelNummer,
        error
      });
    }
    return fallbackValue;
  }

  if (metadataColumnSet.has(column)) {
    if (value === undefined) {
      logMissingMetadataValue(column, field, rawRow);
      return '';
    }
    return value;
  }

  if (field === 'Grafikname') {
    const canonicalGrafikname = typeof value === 'string' ? value : '';
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;
    let mediaAssets: string[] = [];
    if (itemUUID) {
      try {
        mediaAssets = collectMediaAssets(itemUUID, canonicalGrafikname, artikelNummer);
      } catch (error) {
        console.error('[export-items] Failed to collect media assets for CSV export; falling back to stored metadata.', {
          itemUUID,
          artikelNummer,
          error,
        });
      }
    }
    const existingMediaAssets = filterExistingMediaAssets(mediaAssets);
    if (existingMediaAssets.length > 0) {
      return existingMediaAssets.join('|');
    }
    try {
      const storedList = typeof rawRow.ImageNames === 'string' ? rawRow.ImageNames.trim() : '';
      if (storedList) {
        console.warn('[export-items] No media files found for item; using stored ImageNames metadata.', {
          itemUUID,
          artikelNummer,
        });
        return storedList;
      }
    } catch (fallbackError) {
      console.error('[export-items] Failed to read ImageNames metadata fallback for CSV export.', {
        itemUUID,
        artikelNummer,
        error: fallbackError,
      });
    }
    return canonicalGrafikname;
  }

  if (field === 'Langtext') {
    const artikelNummer = typeof rawRow.Artikel_Nummer === 'string' ? rawRow.Artikel_Nummer : null;
    const itemUUID = typeof rawRow.ItemUUID === 'string' ? rawRow.ItemUUID : null;
    const helperContext = {
      logger: console,
      context: `export-items:Langtext:${LANGTEXT_EXPORT_FORMAT}`,
      artikelNummer,
      itemUUID
    } as const;

    try {
      const serialized = serializeLangtextForExport(value, LANGTEXT_EXPORT_FORMAT, helperContext);
      if (serialized !== null && serialized !== undefined) {
        return serialized;
      }

      console.warn(
        '[export-items] Langtext payload resolved to null during configured serialization; attempting fallback.',
        {
          artikelNummer,
          itemUUID,
          format: LANGTEXT_EXPORT_FORMAT
        }
      );

      if (LANGTEXT_EXPORT_FORMAT !== 'json') {
        const fallbackSerialized = serializeLangtextForExport(value, 'json', {
          ...helperContext,
          context: 'export-items:Langtext:fallback-json'
        });

        if (fallbackSerialized !== null && fallbackSerialized !== undefined) {
          console.warn('[export-items] Falling back to JSON Langtext serialization for export.', {
            artikelNummer,
            itemUUID,
            format: LANGTEXT_EXPORT_FORMAT
          });
          return fallbackSerialized;
        }
      }
    } catch (error) {
      console.error('[export-items] Failed to serialize Langtext payload for export; attempting JSON fallback.', {
        artikelNummer,
        itemUUID,
        format: LANGTEXT_EXPORT_FORMAT,
        error
      });
    }

    try {
      return JSON.stringify(value);
    } catch (fallbackError) {
      console.error('[export-items] JSON fallback failed for Langtext payload; exporting empty string.', {
        artikelNummer,
        itemUUID,
        format: LANGTEXT_EXPORT_FORMAT,
        error: fallbackError
      });
      return '';
    }
  }

  if (field !== 'Einheit') {
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

const action = defineHttpAction({
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
          ctx.logEvent({
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
          .map((column: ExportColumn) => {
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
});

export default action;

