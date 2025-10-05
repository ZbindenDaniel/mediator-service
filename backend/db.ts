import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from './config';
import { AgenticRun, Box, Item, LabelJob, EventLog } from '../models';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('Failed to initialize database', err);
  throw err;
}

try {
  // Schema with boxes, items, label queue, and events
  db.exec(`
CREATE TABLE IF NOT EXISTS boxes (
  BoxID TEXT PRIMARY KEY,
  Location TEXT,
  CreatedAt TEXT,
  Notes TEXT,
  PlacedBy TEXT,
  PlacedAt TEXT,
  UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  ItemUUID TEXT PRIMARY KEY,
  BoxID TEXT,
  Location TEXT,
  UpdatedAt TEXT NOT NULL,

  Datum_erfasst TEXT,
  Artikel_Nummer TEXT,
  Grafikname TEXT,
  Artikelbeschreibung TEXT,
  Auf_Lager INTEGER,
  Verkaufspreis REAL,
  Kurzbeschreibung TEXT,
  Langtext TEXT,
  Hersteller TEXT,
  Länge_mm INTEGER,
  Breite_mm INTEGER,
  Höhe_mm INTEGER,
  Gewicht_kg REAL,
  Hauptkategorien_A TEXT,
  Unterkategorien_A TEXT,
  Hauptkategorien_B TEXT,
  Unterkategorien_B TEXT,
  Veröffentlicht_Status TEXT,
  Shopartikel INTEGER,
  Artikeltyp TEXT,
  Einheit TEXT,
  WmsLink TEXT,

  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_mat ON items(Artikel_Nummer);
CREATE INDEX IF NOT EXISTS idx_items_box ON items(BoxID);

CREATE TABLE IF NOT EXISTS item_refs (
  ItemRefID INTEGER PRIMARY KEY AUTOINCREMENT,
  RefKey TEXT NOT NULL UNIQUE,
  Datum_erfasst TEXT,
  Artikel_Nummer TEXT,
  Grafikname TEXT,
  Artikelbeschreibung TEXT,
  Verkaufspreis REAL,
  Kurzbeschreibung TEXT,
  Langtext TEXT,
  Hersteller TEXT,
  Länge_mm INTEGER,
  Breite_mm INTEGER,
  Höhe_mm INTEGER,
  Gewicht_kg REAL,
  Hauptkategorien_A TEXT,
  Unterkategorien_A TEXT,
  Hauptkategorien_B TEXT,
  Unterkategorien_B TEXT,
  Veröffentlicht_Status TEXT,
  Shopartikel INTEGER,
  Artikeltyp TEXT,
  Einheit TEXT,
  WmsLink TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_refs_artikel
  ON item_refs(Artikel_Nummer)
  WHERE Artikel_Nummer IS NOT NULL AND TRIM(Artikel_Nummer) != '';

CREATE TABLE IF NOT EXISTS item_quants (
  ItemUUID TEXT PRIMARY KEY,
  ItemRefID INTEGER NOT NULL,
  BoxID TEXT,
  Location TEXT,
  Quantity INTEGER NOT NULL DEFAULT 0,
  CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UpdatedAt TEXT NOT NULL,
  FOREIGN KEY(ItemRefID) REFERENCES item_refs(ItemRefID) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_quants_ref ON item_quants(ItemRefID);
CREATE INDEX IF NOT EXISTS idx_item_quants_box ON item_quants(BoxID);

CREATE TABLE IF NOT EXISTS label_queue (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  ItemUUID TEXT NOT NULL,
  CreatedAt TEXT NOT NULL,
  Status TEXT NOT NULL DEFAULT 'Queued',
  Error TEXT
);

CREATE TABLE IF NOT EXISTS events (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  CreatedAt TEXT NOT NULL,
  Actor TEXT,
  EntityType TEXT NOT NULL,
  EntityId TEXT NOT NULL,
  Event TEXT NOT NULL,
  Meta TEXT
);
`);
} catch (err) {
  console.error('Failed to create schema', err);
  throw err;
}

function normaliseArtikelNummer(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function makeItemRefKey(artikelNummer: unknown, fallback: string): string {
  const material = normaliseArtikelNummer(artikelNummer);
  if (material) return `artikel:${material}`;
  return `uuid:${fallback}`;
}

function parseQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function ensureItemReferenceBackfill(database: Database.Database = db): void {
  let legacyCount = 0;
  let quantCount = 0;
  try {
    legacyCount = database.prepare(`SELECT COUNT(1) as c FROM items`).get()?.c ?? 0;
    quantCount = database.prepare(`SELECT COUNT(1) as c FROM item_quants`).get()?.c ?? 0;
  } catch (err) {
    console.error('Failed to inspect item tables for migration', err);
    throw err;
  }

  if (!legacyCount || quantCount) {
    return;
  }

  console.info('Backfilling item_refs and item_quants from legacy items table');

  const selectItems = database.prepare(`SELECT * FROM items`);
  const upsertRefStmt = database.prepare(
    `
      INSERT INTO item_refs (
        RefKey, Datum_erfasst, Artikel_Nummer, Grafikname, Artikelbeschreibung,
        Verkaufspreis, Kurzbeschreibung, Langtext, Hersteller,
        Länge_mm, Breite_mm, Höhe_mm, Gewicht_kg,
        Hauptkategorien_A, Unterkategorien_A, Hauptkategorien_B, Unterkategorien_B,
        Veröffentlicht_Status, Shopartikel, Artikeltyp, Einheit, WmsLink
      )
      VALUES (
        @RefKey, @Datum_erfasst, @Artikel_Nummer, @Grafikname, @Artikelbeschreibung,
        @Verkaufspreis, @Kurzbeschreibung, @Langtext, @Hersteller,
        @Länge_mm, @Breite_mm, @Höhe_mm, @Gewicht_kg,
        @Hauptkategorien_A, @Unterkategorien_A, @Hauptkategorien_B, @Unterkategorien_B,
        @Veröffentlicht_Status, @Shopartikel, @Artikeltyp, @Einheit, @WmsLink
      )
      ON CONFLICT(RefKey) DO UPDATE SET
        Datum_erfasst=COALESCE(item_refs.Datum_erfasst, excluded.Datum_erfasst),
        Artikel_Nummer=COALESCE(item_refs.Artikel_Nummer, excluded.Artikel_Nummer),
        Grafikname=COALESCE(item_refs.Grafikname, excluded.Grafikname),
        Artikelbeschreibung=COALESCE(item_refs.Artikelbeschreibung, excluded.Artikelbeschreibung),
        Verkaufspreis=COALESCE(item_refs.Verkaufspreis, excluded.Verkaufspreis),
        Kurzbeschreibung=COALESCE(item_refs.Kurzbeschreibung, excluded.Kurzbeschreibung),
        Langtext=COALESCE(item_refs.Langtext, excluded.Langtext),
        Hersteller=COALESCE(item_refs.Hersteller, excluded.Hersteller),
        Länge_mm=COALESCE(item_refs.Länge_mm, excluded.Länge_mm),
        Breite_mm=COALESCE(item_refs.Breite_mm, excluded.Breite_mm),
        Höhe_mm=COALESCE(item_refs.Höhe_mm, excluded.Höhe_mm),
        Gewicht_kg=COALESCE(item_refs.Gewicht_kg, excluded.Gewicht_kg),
        Hauptkategorien_A=COALESCE(item_refs.Hauptkategorien_A, excluded.Hauptkategorien_A),
        Unterkategorien_A=COALESCE(item_refs.Unterkategorien_A, excluded.Unterkategorien_A),
        Hauptkategorien_B=COALESCE(item_refs.Hauptkategorien_B, excluded.Hauptkategorien_B),
        Unterkategorien_B=COALESCE(item_refs.Unterkategorien_B, excluded.Unterkategorien_B),
        Veröffentlicht_Status=COALESCE(item_refs.Veröffentlicht_Status, excluded.Veröffentlicht_Status),
        Shopartikel=COALESCE(item_refs.Shopartikel, excluded.Shopartikel),
        Artikeltyp=COALESCE(item_refs.Artikeltyp, excluded.Artikeltyp),
        Einheit=COALESCE(item_refs.Einheit, excluded.Einheit),
        WmsLink=COALESCE(item_refs.WmsLink, excluded.WmsLink)
    `
  );
  const getRefId = database.prepare(
    `SELECT ItemRefID FROM item_refs WHERE RefKey = ?`
  );
  const upsertQuantStmt = database.prepare(
    `
      INSERT INTO item_quants (
        ItemUUID, ItemRefID, BoxID, Location, Quantity, CreatedAt, UpdatedAt
      )
      VALUES (
        @ItemUUID, @ItemRefID, @BoxID, @Location, @Quantity, @CreatedAt, @UpdatedAt
      )
      ON CONFLICT(ItemUUID) DO UPDATE SET
        ItemRefID=excluded.ItemRefID,
        BoxID=excluded.BoxID,
        Location=excluded.Location,
        Quantity=excluded.Quantity,
        UpdatedAt=excluded.UpdatedAt,
        CreatedAt=COALESCE(item_quants.CreatedAt, excluded.CreatedAt)
    `
  );

  try {
    database.transaction(() => {
      const items = selectItems.all();
      const now = new Date().toISOString();
      items.forEach((legacy: any) => {
        const itemUUID = legacy.ItemUUID as string;
        const refKey = makeItemRefKey(legacy.Artikel_Nummer, itemUUID);
        const datumErfasst = legacy.Datum_erfasst ?? null;
        upsertRefStmt.run({
          RefKey: refKey,
          Datum_erfasst: datumErfasst,
          Artikel_Nummer: legacy.Artikel_Nummer ?? null,
          Grafikname: legacy.Grafikname ?? null,
          Artikelbeschreibung: legacy.Artikelbeschreibung ?? null,
          Verkaufspreis: legacy.Verkaufspreis ?? null,
          Kurzbeschreibung: legacy.Kurzbeschreibung ?? null,
          Langtext: legacy.Langtext ?? null,
          Hersteller: legacy.Hersteller ?? null,
          Länge_mm: legacy.Länge_mm ?? null,
          Breite_mm: legacy.Breite_mm ?? null,
          Höhe_mm: legacy.Höhe_mm ?? null,
          Gewicht_kg: legacy.Gewicht_kg ?? null,
          Hauptkategorien_A: legacy.Hauptkategorien_A ?? null,
          Unterkategorien_A: legacy.Unterkategorien_A ?? null,
          Hauptkategorien_B: legacy.Hauptkategorien_B ?? null,
          Unterkategorien_B: legacy.Unterkategorien_B ?? null,
          Veröffentlicht_Status: legacy.Veröffentlicht_Status ?? null,
          Shopartikel: legacy.Shopartikel ?? null,
          Artikeltyp: legacy.Artikeltyp ?? null,
          Einheit: legacy.Einheit ?? null,
          WmsLink: legacy.WmsLink ?? null
        });
        const refRow = getRefId.get(refKey) as { ItemRefID: number } | undefined;
        if (!refRow) {
          throw new Error(`Unable to resolve item_ref for key ${refKey}`);
        }
        const createdAt = (datumErfasst as string | null) || legacy.UpdatedAt || now;
        const updatedAt = legacy.UpdatedAt || createdAt || now;
        const quantity = parseQuantity(legacy.Auf_Lager);
        upsertQuantStmt.run({
          ItemUUID: itemUUID,
          ItemRefID: refRow.ItemRefID,
          BoxID: legacy.BoxID ?? null,
          Location: legacy.Location ?? null,
          Quantity: quantity,
          CreatedAt: createdAt,
          UpdatedAt: updatedAt
        });
      });
    })();
  } catch (err) {
    console.error('Failed to backfill item_refs and item_quants', err);
    throw err;
  }
}

const AGENTIC_RUNS_COLUMNS = [
  'Id',
  'ItemUUID',
  'SearchQuery',
  'Status',
  'LastModified',
  'ReviewState',
  'ReviewedBy'
];

const LEGACY_AGENTIC_COLUMNS = [
  'Summary',
  'NeedsReview',
  'ReviewedAt',
  'ReviewDecision',
  'ReviewNotes',
  'TriggeredAt',
  'StartedAt',
  'CompletedAt',
  'FailedAt',
  'LastError',
  'ResultPayload'
];

export function ensureAgenticRunSchema(database: Database.Database = db): void {
  const createAgenticRunsSql = `
CREATE TABLE IF NOT EXISTS agentic_runs (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  ItemUUID TEXT NOT NULL UNIQUE,
  SearchQuery TEXT,
  Status TEXT NOT NULL,
  LastModified TEXT NOT NULL DEFAULT (datetime('now')),
  ReviewState TEXT NOT NULL DEFAULT 'not_required',
  ReviewedBy TEXT,
  FOREIGN KEY(ItemUUID) REFERENCES items(ItemUUID) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agentic_runs_item ON agentic_runs(ItemUUID);
`;

  let tableInfo: Array<{ name: string }> = [];
  try {
    tableInfo = database.prepare(`PRAGMA table_info(agentic_runs)`).all();
  } catch (err) {
    console.error('Failed to inspect agentic_runs schema', err);
    throw err;
  }

  if (!tableInfo.length) {
    try {
      database.exec(createAgenticRunsSql);
    } catch (err) {
      console.error('Failed to create agentic_runs table', err);
      throw err;
    }
    return;
  }

  const columnNames = new Set(tableInfo.map((column) => column.name));
  const hasAllExpectedColumns = AGENTIC_RUNS_COLUMNS.every((column) => columnNames.has(column));
  const stillHasLegacyColumns = LEGACY_AGENTIC_COLUMNS.some((column) => columnNames.has(column));

  if (hasAllExpectedColumns && !stillHasLegacyColumns) {
    try {
      database.exec(createAgenticRunsSql);
    } catch (err) {
      console.error('Failed to ensure agentic_runs schema', err);
      throw err;
    }
    return;
  }

  console.info('Migrating agentic_runs table to simplified schema');

  try {
    database.transaction(() => {
      database.exec(`DROP INDEX IF EXISTS idx_agentic_runs_item`);
      database.exec(`ALTER TABLE agentic_runs RENAME TO agentic_runs_legacy`);

      database.exec(createAgenticRunsSql);

      const selectColumns: string[] = [];
      selectColumns.push('ItemUUID');
      selectColumns.push(columnNames.has('SearchQuery') ? 'SearchQuery AS SearchQuery' : 'NULL AS SearchQuery');
      selectColumns.push('Status');

      if (columnNames.has('LastModified')) {
        selectColumns.push(
          "COALESCE(LastModified, datetime('now')) AS LastModified"
        );
      } else {
        const timestampColumns: string[] = [];
        if (columnNames.has('CompletedAt')) timestampColumns.push('CompletedAt');
        if (columnNames.has('FailedAt')) timestampColumns.push('FailedAt');
        if (columnNames.has('StartedAt')) timestampColumns.push('StartedAt');
        if (columnNames.has('TriggeredAt')) timestampColumns.push('TriggeredAt');
        if (columnNames.has('ReviewedAt')) timestampColumns.push('ReviewedAt');
        const coalesce = timestampColumns.length
          ? `COALESCE(${timestampColumns.join(', ')}, datetime('now'))`
          : "datetime('now')";
        selectColumns.push(`${coalesce} AS LastModified`);
      }

      if (columnNames.has('ReviewState')) {
        selectColumns.push(
          "CASE WHEN TRIM(IFNULL(ReviewState, '')) = '' THEN 'not_required' ELSE LOWER(ReviewState) END AS ReviewState"
        );
      } else if (columnNames.has('NeedsReview') || columnNames.has('ReviewDecision')) {
        const needsReviewExpr = columnNames.has('NeedsReview') ? 'COALESCE(NeedsReview, 0)' : '0';
        const reviewDecisionExpr = columnNames.has('ReviewDecision') ? 'LOWER(IFNULL(TRIM(ReviewDecision), \'\'))' : "''";
        selectColumns.push(
          `CASE
             WHEN ${needsReviewExpr} > 0 THEN 'pending'
             WHEN ${reviewDecisionExpr} IN ('approved', 'rejected') THEN ${reviewDecisionExpr}
             WHEN ${reviewDecisionExpr} != '' THEN ${reviewDecisionExpr}
             ELSE 'not_required'
           END AS ReviewState`
        );
      } else {
        selectColumns.push(`'not_required' AS ReviewState`);
      }

      selectColumns.push(columnNames.has('ReviewedBy') ? 'ReviewedBy AS ReviewedBy' : 'NULL AS ReviewedBy');

      const migrateSql = `
        INSERT INTO agentic_runs (
          ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy
        )
        SELECT
          ${selectColumns.join(',\n          ')}
        FROM agentic_runs_legacy;
      `;

      database.exec(migrateSql);
      database.exec('DROP TABLE agentic_runs_legacy');
    })();
  } catch (err) {
    console.error('Failed to migrate agentic_runs schema', err);
    throw err;
  }
}

ensureAgenticRunSchema(db);

ensureItemReferenceBackfill(db);

export { db };

const upsertBoxStmt = db.prepare(
  `
    INSERT INTO boxes (BoxID, Location, CreatedAt, Notes, PlacedBy, PlacedAt, UpdatedAt)
    VALUES (@BoxID, @Location, @CreatedAt, @Notes, @PlacedBy, @PlacedAt, @UpdatedAt)
    ON CONFLICT(BoxID) DO UPDATE SET
      Location=excluded.Location,
      CreatedAt=COALESCE(excluded.CreatedAt, boxes.CreatedAt),
      Notes=COALESCE(excluded.Notes, boxes.Notes),
      PlacedBy=COALESCE(excluded.PlacedBy, boxes.PlacedBy),
      PlacedAt=COALESCE(excluded.PlacedAt, boxes.PlacedAt),
      UpdatedAt=excluded.UpdatedAt
  `
);

export const upsertBox = upsertBoxStmt;

const ITEM_METADATA_COLUMNS = [
  'Datum_erfasst',
  'Artikel_Nummer',
  'Grafikname',
  'Artikelbeschreibung',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg',
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Artikeltyp',
  'Einheit',
  'WmsLink'
] as const;

export type ItemRefRecord = {
  RefKey: string;
} & { [K in (typeof ITEM_METADATA_COLUMNS)[number]]?: unknown };

export type ItemQuantRecord = {
  ItemUUID: string;
  ItemRefID: number;
  Quantity: number;
  UpdatedAt: string;
  BoxID?: string | null;
  Location?: string | null;
  CreatedAt?: string | null;
};

const upsertItemRefStmt = db.prepare(
  `
    INSERT INTO item_refs (
      RefKey, Datum_erfasst, Artikel_Nummer, Grafikname, Artikelbeschreibung,
      Verkaufspreis, Kurzbeschreibung, Langtext, Hersteller,
      Länge_mm, Breite_mm, Höhe_mm, Gewicht_kg,
      Hauptkategorien_A, Unterkategorien_A, Hauptkategorien_B, Unterkategorien_B,
      Veröffentlicht_Status, Shopartikel, Artikeltyp, Einheit, WmsLink
    )
    VALUES (
      @RefKey, @Datum_erfasst, @Artikel_Nummer, @Grafikname, @Artikelbeschreibung,
      @Verkaufspreis, @Kurzbeschreibung, @Langtext, @Hersteller,
      @Länge_mm, @Breite_mm, @Höhe_mm, @Gewicht_kg,
      @Hauptkategorien_A, @Unterkategorien_A, @Hauptkategorien_B, @Unterkategorien_B,
      @Veröffentlicht_Status, @Shopartikel, @Artikeltyp, @Einheit, @WmsLink
    )
    ON CONFLICT(RefKey) DO UPDATE SET
      Datum_erfasst=COALESCE(item_refs.Datum_erfasst, excluded.Datum_erfasst),
      Artikel_Nummer=COALESCE(item_refs.Artikel_Nummer, excluded.Artikel_Nummer),
      Grafikname=COALESCE(item_refs.Grafikname, excluded.Grafikname),
      Artikelbeschreibung=COALESCE(item_refs.Artikelbeschreibung, excluded.Artikelbeschreibung),
      Verkaufspreis=COALESCE(item_refs.Verkaufspreis, excluded.Verkaufspreis),
      Kurzbeschreibung=COALESCE(item_refs.Kurzbeschreibung, excluded.Kurzbeschreibung),
      Langtext=COALESCE(item_refs.Langtext, excluded.Langtext),
      Hersteller=COALESCE(item_refs.Hersteller, excluded.Hersteller),
      Länge_mm=COALESCE(item_refs.Länge_mm, excluded.Länge_mm),
      Breite_mm=COALESCE(item_refs.Breite_mm, excluded.Breite_mm),
      Höhe_mm=COALESCE(item_refs.Höhe_mm, excluded.Höhe_mm),
      Gewicht_kg=COALESCE(item_refs.Gewicht_kg, excluded.Gewicht_kg),
      Hauptkategorien_A=COALESCE(item_refs.Hauptkategorien_A, excluded.Hauptkategorien_A),
      Unterkategorien_A=COALESCE(item_refs.Unterkategorien_A, excluded.Unterkategorien_A),
      Hauptkategorien_B=COALESCE(item_refs.Hauptkategorien_B, excluded.Hauptkategorien_B),
      Unterkategorien_B=COALESCE(item_refs.Unterkategorien_B, excluded.Unterkategorien_B),
      Veröffentlicht_Status=COALESCE(item_refs.Veröffentlicht_Status, excluded.Veröffentlicht_Status),
      Shopartikel=COALESCE(item_refs.Shopartikel, excluded.Shopartikel),
      Artikeltyp=COALESCE(item_refs.Artikeltyp, excluded.Artikeltyp),
      Einheit=COALESCE(item_refs.Einheit, excluded.Einheit),
      WmsLink=COALESCE(item_refs.WmsLink, excluded.WmsLink)
  `
);

const selectItemRefIdByKey = db.prepare(`SELECT ItemRefID FROM item_refs WHERE RefKey = ?`);

const upsertItemQuantStmt = db.prepare(
  `
    INSERT INTO item_quants (
      ItemUUID, ItemRefID, BoxID, Location, Quantity, CreatedAt, UpdatedAt
    )
    VALUES (
      @ItemUUID, @ItemRefID, @BoxID, @Location, @Quantity,
      COALESCE(@CreatedAt, datetime('now')),
      @UpdatedAt
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      ItemRefID=excluded.ItemRefID,
      BoxID=excluded.BoxID,
      Location=excluded.Location,
      Quantity=excluded.Quantity,
      UpdatedAt=excluded.UpdatedAt,
      CreatedAt=COALESCE(item_quants.CreatedAt, excluded.CreatedAt)
  `
);

const incrementQuantStmt = db.prepare(
  `
    UPDATE item_quants
       SET Quantity = Quantity + 1,
           UpdatedAt = datetime('now')
     WHERE ItemUUID = ?
  `
);

const decrementQuantStmt = db.prepare(
  `
    UPDATE item_quants
       SET Quantity = CASE WHEN Quantity - 1 < 0 THEN 0 ELSE Quantity - 1 END,
           BoxID = CASE WHEN Quantity - 1 <= 0 THEN NULL ELSE BoxID END,
           Location = CASE WHEN Quantity - 1 <= 0 THEN NULL ELSE Location END,
           UpdatedAt = datetime('now')
     WHERE ItemUUID = ? AND Quantity > 0
  `
);

const deleteItemQuantStmt = db.prepare(`DELETE FROM item_quants WHERE ItemUUID = ?`);

export function createItemRefKey(artikelNummer: string | null | undefined, fallback: string): string {
  return makeItemRefKey(artikelNummer, fallback);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export function buildItemRefRecord(item: Item): ItemRefRecord {
  const refKey = createItemRefKey(item.Artikel_Nummer ?? null, item.ItemUUID);
  const record: ItemRefRecord = { RefKey: refKey };
  ITEM_METADATA_COLUMNS.forEach((column) => {
    switch (column) {
      case 'Datum_erfasst':
        record[column] = toIso((item as any)[column]);
        break;
      case 'Veröffentlicht_Status':
        if (typeof (item as any)[column] === 'boolean') {
          record[column] = (item as any)[column] ? 'yes' : 'no';
        } else {
          record[column] = (item as any)[column] ?? null;
        }
        break;
      default:
        record[column] = (item as any)[column] ?? null;
        break;
    }
  });
  return record;
}

export function buildItemQuantRecord(item: Item, itemRefId: number): ItemQuantRecord {
  const updatedAt = toIso(item.UpdatedAt) ?? new Date().toISOString();
  const createdAt = toIso((item as any).Datum_erfasst) ?? updatedAt;
  const boxId = (item as any).BoxID;
  const location = (item as any).Location;
  return {
    ItemUUID: item.ItemUUID,
    ItemRefID: itemRefId,
    Quantity: parseQuantity((item as any).Auf_Lager),
    BoxID:
      typeof boxId === 'string'
        ? boxId.trim() || null
        : boxId ?? null,
    Location:
      typeof location === 'string'
        ? location.trim() || null
        : location ?? null,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt
  };
}

export function upsertItemRef(record: ItemRefRecord): number {
  try {
    const payload: Record<string, unknown> = { RefKey: record.RefKey };
    ITEM_METADATA_COLUMNS.forEach((column) => {
      payload[column] = record[column] ?? null;
    });
    upsertItemRefStmt.run(payload);
    const resolved = selectItemRefIdByKey.get(record.RefKey) as { ItemRefID: number } | undefined;
    if (!resolved) {
      throw new Error(`Failed to resolve item_ref for key ${record.RefKey}`);
    }
    return resolved.ItemRefID;
  } catch (err) {
    console.error('Failed to upsert item_ref', err);
    throw err;
  }
}

export function upsertItemQuant(record: ItemQuantRecord): void {
  try {
    const payload = {
      ItemUUID: record.ItemUUID,
      ItemRefID: record.ItemRefID,
      BoxID: record.BoxID ?? null,
      Location: record.Location ?? null,
      Quantity: record.Quantity,
      CreatedAt: record.CreatedAt ?? null,
      UpdatedAt: record.UpdatedAt
    };
    upsertItemQuantStmt.run(payload);
  } catch (err) {
    console.error('Failed to upsert item_quant', err);
    throw err;
  }
}

export function incrementQuant(itemUUID: string): void {
  try {
    incrementQuantStmt.run(itemUUID);
  } catch (err) {
    console.error('Failed to increment quantity', err);
    throw err;
  }
}

export function decrementQuant(itemUUID: string): void {
  try {
    decrementQuantStmt.run(itemUUID);
  } catch (err) {
    console.error('Failed to decrement quantity', err);
    throw err;
  }
}

export function deleteItemQuant(itemUUID: string): void {
  try {
    deleteItemQuantStmt.run(itemUUID);
  } catch (err) {
    console.error('Failed to delete item quantity', err);
    throw err;
  }
}

export const queueLabel = db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`);

const ITEM_SELECT_BASE = `
  SELECT
    q.ItemUUID,
    q.ItemRefID,
    q.BoxID,
    q.Location,
    q.Quantity AS Auf_Lager,
    q.CreatedAt,
    q.UpdatedAt,
    r.Datum_erfasst,
    r.Artikel_Nummer,
    r.Grafikname,
    r.Artikelbeschreibung,
    r.Verkaufspreis,
    r.Kurzbeschreibung,
    r.Langtext,
    r.Hersteller,
    r.Länge_mm,
    r.Breite_mm,
    r.Höhe_mm,
    r.Gewicht_kg,
    r.Hauptkategorien_A,
    r.Unterkategorien_A,
    r.Hauptkategorien_B,
    r.Unterkategorien_B,
    r.Veröffentlicht_Status,
    r.Shopartikel,
    r.Artikeltyp,
    r.Einheit,
    r.WmsLink
  FROM item_quants q
  JOIN item_refs r ON q.ItemRefID = r.ItemRefID
`;

export const getItem = db.prepare(`${ITEM_SELECT_BASE} WHERE q.ItemUUID = ?`);
export const findByMaterial = db.prepare(
  `${ITEM_SELECT_BASE} WHERE r.Artikel_Nummer = ? ORDER BY q.UpdatedAt DESC`
);
export const itemsByBox = db.prepare(
  `${ITEM_SELECT_BASE} WHERE q.BoxID = ? ORDER BY q.ItemUUID`
);
export const getBox = db.prepare(`SELECT * FROM boxes WHERE BoxID = ?`);
export const listBoxes = db.prepare(`SELECT * FROM boxes ORDER BY BoxID`);
export const upsertAgenticRun = db.prepare(
  `
    INSERT INTO agentic_runs (
      ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy
    )
    VALUES (
      @ItemUUID, @SearchQuery, @Status, @LastModified, @ReviewState, @ReviewedBy
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      SearchQuery=COALESCE(excluded.SearchQuery, agentic_runs.SearchQuery),
      Status=excluded.Status,
      LastModified=excluded.LastModified,
      ReviewState=excluded.ReviewState,
      ReviewedBy=excluded.ReviewedBy
  `
);
export const getAgenticRun = db.prepare(`
  SELECT Id, ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy
  FROM agentic_runs
  WHERE ItemUUID = ?
`);
export const updateAgenticRunStatus = db.prepare(
  `
    UPDATE agentic_runs
       SET Status=@Status,
           SearchQuery=COALESCE(@SearchQuery, SearchQuery),
           LastModified=@LastModified,
           ReviewState=@ReviewState,
           ReviewedBy=@ReviewedBy
     WHERE ItemUUID=@ItemUUID
  `
);
export const nextLabelJob = db.prepare(`SELECT * FROM label_queue WHERE Status = 'Queued' ORDER BY Id LIMIT 1`);
export const updateLabelJobStatus = db.prepare(`UPDATE label_queue SET Status = ?, Error = ? WHERE Id = ?`);
export const deleteBox = db.prepare(`DELETE FROM boxes WHERE BoxID = ?`);
export const logEvent = db.prepare(`INSERT INTO events (CreatedAt, Actor, EntityType, EntityId, Event, Meta) VALUES (datetime('now'), @Actor, @EntityType, @EntityId, @Event, @Meta)`);
export const listEventsForBox = db.prepare(`SELECT * FROM events WHERE EntityType='Box' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listEventsForItem = db.prepare(`SELECT * FROM events WHERE EntityType='Item' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listRecentEvents = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         r.Artikelbeschreibung, r.Artikel_Nummer
  FROM events e
  LEFT JOIN item_quants q ON e.EntityType='Item' AND e.EntityId = q.ItemUUID
  LEFT JOIN item_refs r ON q.ItemRefID = r.ItemRefID
  ORDER BY e.Id DESC LIMIT 3`);
export const listRecentActivities = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         r.Artikelbeschreibung, r.Artikel_Nummer
  FROM events e
  LEFT JOIN item_quants q ON e.EntityType='Item' AND e.EntityId = q.ItemUUID
  LEFT JOIN item_refs r ON q.ItemRefID = r.ItemRefID
  ORDER BY e.Id DESC
  LIMIT @limit`);
export const countEvents = db.prepare(`SELECT COUNT(*) as c FROM events`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = db.prepare(`SELECT COUNT(*) as c FROM item_quants`);
export const countItemsNoWms = db.prepare(`
  SELECT COUNT(*) as c
    FROM item_quants q
    JOIN item_refs r ON q.ItemRefID = r.ItemRefID
   WHERE IFNULL(r.WmsLink,'') = ''
`);
export const countItemsNoBox = db.prepare(`
  SELECT COUNT(*) as c
    FROM item_quants
   WHERE BoxID IS NULL OR TRIM(BoxID) = ''
`);
export const listRecentBoxes = db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 4`);
export const getMaxBoxId = db.prepare(
  `SELECT BoxID FROM boxes ORDER BY CAST(substr(BoxID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxItemId = db.prepare(
  `SELECT ItemUUID FROM item_quants ORDER BY CAST(substr(ItemUUID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxArtikelNummer = db.prepare(`
    SELECT Artikel_Nummer FROM item_refs
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `);

export const updateAgenticReview = db.prepare(`
  UPDATE agentic_runs
  SET ReviewState = @ReviewState,
      ReviewedBy = @ReviewedBy,
      LastModified = @LastModified
  WHERE ItemUUID = @ItemUUID
`);

export const listItems = db.prepare(
  `SELECT
      q.ItemUUID,
      q.ItemRefID,
      q.BoxID,
      q.Location AS StoredLocation,
      q.Quantity AS Auf_Lager,
      q.CreatedAt,
      q.UpdatedAt,
      r.Datum_erfasst,
      r.Artikel_Nummer,
      r.Grafikname,
      r.Artikelbeschreibung,
      r.Verkaufspreis,
      r.Kurzbeschreibung,
      r.Langtext,
      r.Hersteller,
      r.Länge_mm,
      r.Breite_mm,
      r.Höhe_mm,
      r.Gewicht_kg,
      r.Hauptkategorien_A,
      r.Unterkategorien_A,
      r.Hauptkategorien_B,
      r.Unterkategorien_B,
      r.Veröffentlicht_Status,
      r.Shopartikel,
      r.Artikeltyp,
      r.Einheit,
      r.WmsLink,
      COALESCE(q.Location, b.Location) AS Location
   FROM item_quants q
   JOIN item_refs r ON q.ItemRefID = r.ItemRefID
   LEFT JOIN boxes b ON q.BoxID = b.BoxID
   ORDER BY q.ItemUUID`
);

export const listItemsForExport = db.prepare(
  `SELECT
      q.ItemUUID,
      q.ItemRefID,
      q.BoxID,
      q.Location AS StoredLocation,
      q.Quantity AS Auf_Lager,
      q.CreatedAt,
      q.UpdatedAt,
      r.Datum_erfasst,
      r.Artikel_Nummer,
      r.Grafikname,
      r.Artikelbeschreibung,
      r.Verkaufspreis,
      r.Kurzbeschreibung,
      r.Langtext,
      r.Hersteller,
      r.Länge_mm,
      r.Breite_mm,
      r.Höhe_mm,
      r.Gewicht_kg,
      r.Hauptkategorien_A,
      r.Unterkategorien_A,
      r.Hauptkategorien_B,
      r.Unterkategorien_B,
      r.Veröffentlicht_Status,
      r.Shopartikel,
      r.Artikeltyp,
      r.Einheit,
      r.WmsLink,
      COALESCE(q.Location, b.Location) AS Location
   FROM item_quants q
   JOIN item_refs r ON q.ItemRefID = r.ItemRefID
   LEFT JOIN boxes b ON q.BoxID = b.BoxID
   WHERE (@createdAfter IS NULL OR r.Datum_erfasst >= @createdAfter)
     AND (@updatedAfter IS NULL OR q.UpdatedAt >= @updatedAfter)
   ORDER BY r.Datum_erfasst`
);

export type { AgenticRun, Box, Item, LabelJob, EventLog };

