import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from './config';
import { Box, Item, LabelJob, EventLog } from '../models';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
let db: any;
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
  BoxID TEXT NOT NULL,
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

  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID)
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
export const nextLabelJob = db.prepare(`SELECT * FROM label_queue WHERE Status = 'Queued' ORDER BY Id LIMIT 1`);
export const updateLabelJobStatus = db.prepare(`UPDATE label_queue SET Status = ?, Error = ? WHERE Id = ?`);
export const decrementItemStock = db.prepare(
  `UPDATE items
   SET Auf_Lager = Auf_Lager - 1,
       BoxID = CASE WHEN Auf_Lager - 1 <= 0 THEN '' ELSE BoxID END,
       Location = CASE WHEN Auf_Lager - 1 <= 0 THEN '' ELSE Location END,
       UpdatedAt = datetime('now')
   WHERE ItemUUID = ? AND Auf_Lager > 0`
);
export const deleteItem = db.prepare(`DELETE FROM items WHERE ItemUUID = ?`);
export const deleteBox = db.prepare(`DELETE FROM boxes WHERE BoxID = ?`);
export const logEvent = db.prepare(`INSERT INTO events (CreatedAt, Actor, EntityType, EntityId, Event, Meta) VALUES (datetime('now'), @Actor, @EntityType, @EntityId, @Event, @Meta)`);
export const listEventsForBox = db.prepare(`SELECT * FROM events WHERE EntityType='Box' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listEventsForItem = db.prepare(`SELECT * FROM events WHERE EntityType='Item' AND EntityId=? ORDER BY Id DESC LIMIT 200`);
export const listRecentEvents = db.prepare(`SELECT Id, CreatedAt, Actor, EntityType, EntityId, Event, Meta FROM events ORDER BY Id DESC LIMIT 15`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = db.prepare(`SELECT COUNT(*) as c FROM items`);
export const countItemsNoWms = db.prepare(`SELECT COUNT(*) as c FROM items WHERE IFNULL(WmsLink,'') = ''`);
export const listRecentBoxes = db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 8`);
export const getMaxArtikelNummer = db.prepare(`
    SELECT Artikel_Nummer FROM items
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `);

export const listItemsForExport = db.prepare(
  `SELECT * FROM items
   WHERE (@createdAfter IS NULL OR Datum_erfasst >= @createdAfter)
     AND (@updatedAfter IS NULL OR UpdatedAt >= @updatedAfter)
   ORDER BY Datum_erfasst`
);

export type { Box, Item, LabelJob, EventLog };

