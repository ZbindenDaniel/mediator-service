const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { DB_PATH } = require("./config");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

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

module.exports = {
  db,
  upsertBox: db.prepare(`
    INSERT INTO boxes (BoxID, Location, CreatedAt, Notes, PlacedBy, PlacedAt, UpdatedAt)
    VALUES (@BoxID, @Location, @CreatedAt, @Notes, @PlacedBy, @PlacedAt, @UpdatedAt)
    ON CONFLICT(BoxID) DO UPDATE SET
      Location=excluded.Location,
      CreatedAt=COALESCE(excluded.CreatedAt, boxes.CreatedAt),
      Notes=COALESCE(excluded.Notes, boxes.Notes),
      PlacedBy=COALESCE(excluded.PlacedBy, boxes.PlacedBy),
      PlacedAt=COALESCE(excluded.PlacedAt, boxes.PlacedAt),
      UpdatedAt=excluded.UpdatedAt
  `),
  upsertItem: db.prepare(`
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
  `),
  queueLabel: db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`),
  getItem: db.prepare(`SELECT * FROM items WHERE ItemUUID = ?`),
  findByMaterial: db.prepare(`SELECT * FROM items WHERE Artikel_Nummer = ? ORDER BY UpdatedAt DESC`),
  itemsByBox: db.prepare(`SELECT * FROM items WHERE BoxID = ? ORDER BY ItemUUID`),
  getBox: db.prepare(`SELECT * FROM boxes WHERE BoxID = ?`),
  listBoxes: db.prepare(`SELECT * FROM boxes ORDER BY BoxID`),
  nextLabelJob: db.prepare(`SELECT * FROM label_queue WHERE Status = 'Queued' ORDER BY Id LIMIT 1`),
  updateLabelJobStatus: db.prepare(`UPDATE label_queue SET Status = ?, Error = ? WHERE Id = ?`),
  logEvent: db.prepare(`INSERT INTO events (CreatedAt, Actor, EntityType, EntityId, Event, Meta) VALUES (datetime('now'), @Actor, @EntityType, @EntityId, @Event, @Meta)`),
  listEventsForBox: db.prepare(`SELECT * FROM events WHERE EntityType='Box' AND EntityId=? ORDER BY Id DESC LIMIT 200`),
  listEventsForItem: db.prepare(`SELECT * FROM events WHERE EntityType='Item' AND EntityId=? ORDER BY Id DESC LIMIT 200`),

  listRecentEvents: db.prepare(`SELECT Id, CreatedAt, Actor, EntityType, EntityId, Event, Meta
                                FROM events ORDER BY Id DESC LIMIT 15`),
                                
  countBoxes: db.prepare(`SELECT COUNT(*) as c FROM boxes`),
  countItems: db.prepare(`SELECT COUNT(*) as c FROM items`),
  countItemsNoWms: db.prepare(`SELECT COUNT(*) as c FROM items WHERE IFNULL(WmsLink,'') = ''`),

  listRecentBoxes: db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 8`),
  getMaxArtikelNummer: db.prepare(`
    SELECT Artikel_Nummer FROM items
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `),

};
