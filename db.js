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
  BoxNotes TEXT,
  PlacedBy TEXT,
  PlacedAt TEXT,
  UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  ItemUUID TEXT PRIMARY KEY,
  BoxID TEXT NOT NULL,
  MaterialNumber TEXT,
  Description TEXT,
  Condition TEXT,
  Qty INTEGER,
  WmsLink TEXT,
  AttributesJson TEXT,
  AddedAt TEXT,
  Location TEXT,
  ItemNotes TEXT,
  UpdatedAt TEXT NOT NULL,
  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID)
);

CREATE INDEX IF NOT EXISTS idx_items_mat ON items(MaterialNumber);
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
    INSERT INTO boxes (BoxID, Location, CreatedAt, Notes, BoxNotes, PlacedBy, PlacedAt, UpdatedAt)
    VALUES (@BoxID,@Location,@CreatedAt,@Notes,@BoxNotes,@PlacedBy,@PlacedAt,@UpdatedAt)
    ON CONFLICT(BoxID) DO UPDATE SET
      Location=excluded.Location,
      CreatedAt=COALESCE(excluded.CreatedAt, boxes.CreatedAt),
      Notes=COALESCE(excluded.Notes, boxes.Notes),
      BoxNotes=COALESCE(excluded.BoxNotes, boxes.BoxNotes),
      PlacedBy=COALESCE(excluded.PlacedBy, boxes.PlacedBy),
      PlacedAt=COALESCE(excluded.PlacedAt, boxes.PlacedAt),
      UpdatedAt=excluded.UpdatedAt
  `),
  upsertItem: db.prepare(`
    INSERT INTO items (ItemUUID, BoxID, MaterialNumber, Description, Condition, Qty, WmsLink, AttributesJson, AddedAt, Location, ItemNotes, UpdatedAt)
    VALUES (@ItemUUID,@BoxID,@MaterialNumber,@Description,@Condition,@Qty,@WmsLink,@AttributesJson,@AddedAt,@Location,@ItemNotes,@UpdatedAt)
    ON CONFLICT(ItemUUID) DO UPDATE SET
      BoxID=excluded.BoxID,
      MaterialNumber=excluded.MaterialNumber,
      Description=excluded.Description,
      Condition=excluded.Condition,
      Qty=excluded.Qty,
      WmsLink=excluded.WmsLink,
      AttributesJson=excluded.AttributesJson,
      AddedAt=COALESCE(excluded.AddedAt, items.AddedAt),
      Location=excluded.Location,
      ItemNotes=COALESCE(excluded.ItemNotes, items.ItemNotes),
      UpdatedAt=excluded.UpdatedAt
  `),
  queueLabel: db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`),
  getItem: db.prepare(`SELECT * FROM items WHERE ItemUUID = ?`),
  findByMaterial: db.prepare(`SELECT * FROM items WHERE MaterialNumber = ? ORDER BY UpdatedAt DESC`),
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

  listRecentBoxes: db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 8`)

};
