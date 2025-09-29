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

export { db };

export const upsertBox = db.prepare(
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

export const upsertItem = db.prepare(
  `
    INSERT INTO items (
      ItemUUID, BoxID, Location, UpdatedAt,
      Datum_erfasst, Artikel_Nummer, Grafikname, Artikelbeschreibung, Auf_Lager, Verkaufspreis,
      Kurzbeschreibung, Langtext, Hersteller, Länge_mm, Breite_mm, Höhe_mm, Gewicht_kg,
      Hauptkategorien_A, Unterkategorien_A, Hauptkategorien_B, Unterkategorien_B,
      Veröffentlicht_Status, Shopartikel, Artikeltyp, Einheit, WmsLink
    )
    VALUES (
      @ItemUUID, @BoxID, @Location, @UpdatedAt,
      @Datum_erfasst, @Artikel_Nummer, @Grafikname, @Artikelbeschreibung, @Auf_Lager, @Verkaufspreis,
      @Kurzbeschreibung, @Langtext, @Hersteller, @Länge_mm, @Breite_mm, @Höhe_mm, @Gewicht_kg,
      @Hauptkategorien_A, @Unterkategorien_A, @Hauptkategorien_B, @Unterkategorien_B,
      @Veröffentlicht_Status, @Shopartikel, @Artikeltyp, @Einheit, @WmsLink
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      BoxID=excluded.BoxID,
      Location=excluded.Location,
      UpdatedAt=excluded.UpdatedAt,
      Datum_erfasst=excluded.Datum_erfasst,
      Artikel_Nummer=excluded.Artikel_Nummer,
      Grafikname=excluded.Grafikname,
      Artikelbeschreibung=excluded.Artikelbeschreibung,
      Auf_Lager=excluded.Auf_Lager,
      Verkaufspreis=excluded.Verkaufspreis,
      Kurzbeschreibung=excluded.Kurzbeschreibung,
      Langtext=excluded.Langtext,
      Hersteller=excluded.Hersteller,
      Länge_mm=excluded.Länge_mm,
      Breite_mm=excluded.Breite_mm,
      Höhe_mm=excluded.Höhe_mm,
      Gewicht_kg=excluded.Gewicht_kg,
      Hauptkategorien_A=excluded.Hauptkategorien_A,
      Unterkategorien_A=excluded.Unterkategorien_A,
      Hauptkategorien_B=excluded.Hauptkategorien_B,
      Unterkategorien_B=excluded.Unterkategorien_B,
      Veröffentlicht_Status=excluded.Veröffentlicht_Status,
      Shopartikel=excluded.Shopartikel,
      Artikeltyp=excluded.Artikeltyp,
      Einheit=excluded.Einheit,
      WmsLink=excluded.WmsLink
  `
);

export const queueLabel = db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`);
export const getItem = db.prepare(`SELECT * FROM items WHERE ItemUUID = ?`);
export const findByMaterial = db.prepare(`SELECT * FROM items WHERE Artikel_Nummer = ? ORDER BY UpdatedAt DESC`);
export const itemsByBox = db.prepare(`SELECT * FROM items WHERE BoxID = ? ORDER BY ItemUUID`);
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
export const decrementItemStock = db.prepare(
  `UPDATE items
   SET Auf_Lager = Auf_Lager - 1,
       BoxID = CASE WHEN Auf_Lager - 1 <= 0 THEN NULL ELSE BoxID END,
       Location = CASE WHEN Auf_Lager - 1 <= 0 THEN NULL ELSE Location END,
       UpdatedAt = datetime('now')
   WHERE ItemUUID = ? AND Auf_Lager > 0`
);
export const incrementItemStock = db.prepare(
  `UPDATE items
   SET Auf_Lager = Auf_Lager + 1,
       UpdatedAt = datetime('now')
   WHERE ItemUUID = ?`
);
export const deleteItem = db.prepare(`DELETE FROM items WHERE ItemUUID = ?`);
export const deleteBox = db.prepare(`DELETE FROM boxes WHERE BoxID = ?`);
export const logEvent = db.prepare(`INSERT INTO events (CreatedAt, Actor, EntityType, EntityId, Event, Meta) VALUES (datetime('now'), @Actor, @EntityType, @EntityId, @Event, @Meta)`);
export const listEventsForBox = db.prepare(`SELECT * FROM events WHERE EntityType='Box' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listEventsForItem = db.prepare(`SELECT * FROM events WHERE EntityType='Item' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listRecentEvents = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         i.Artikelbeschreibung, i.Artikel_Nummer
  FROM events e
  LEFT JOIN items i ON e.EntityType='Item' AND e.EntityId = i.ItemUUID
  ORDER BY e.Id DESC LIMIT 15`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = db.prepare(`SELECT COUNT(*) as c FROM items`);
export const countItemsNoWms = db.prepare(`SELECT COUNT(*) as c FROM items WHERE IFNULL(WmsLink,'') = ''`);
export const countItemsNoBox = db.prepare(`SELECT COUNT(*) as c FROM items WHERE BoxID IS NULL OR BoxID = ''`);
export const listRecentBoxes = db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 8`);
export const getMaxBoxId = db.prepare(
  `SELECT BoxID FROM boxes ORDER BY CAST(substr(BoxID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxItemId = db.prepare(
  `SELECT ItemUUID FROM items ORDER BY CAST(substr(ItemUUID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxArtikelNummer = db.prepare(`
    SELECT Artikel_Nummer FROM items
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
  `SELECT i.*, COALESCE(i.Location, b.Location) AS Location
   FROM items i
   LEFT JOIN boxes b ON i.BoxID = b.BoxID
   ORDER BY i.ItemUUID`
);

export type { AgenticRun, Box, Item, LabelJob, EventLog };

