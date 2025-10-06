import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from './config';
import { AgenticRun, Box, Item, ItemInstance, ItemRef, LabelJob, EventLog } from '../models';

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
  // Schema with boxes, label queue, and events; item tables ensured separately
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

const CREATE_ITEM_REFS_SQL = `
CREATE TABLE IF NOT EXISTS item_refs (
  Artikel_Nummer TEXT PRIMARY KEY,
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
  WmsLink TEXT,
  EntityType TEXT
);
CREATE INDEX IF NOT EXISTS idx_item_refs_wms ON item_refs(WmsLink);
`;

const CREATE_ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS items (
  ItemUUID TEXT PRIMARY KEY,
  Artikel_Nummer TEXT,
  BoxID TEXT,
  Location TEXT,
  UpdatedAt TEXT NOT NULL,
  Datum_erfasst TEXT,
  Auf_Lager INTEGER,
  FOREIGN KEY(Artikel_Nummer) REFERENCES item_refs(Artikel_Nummer) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_items_mat ON items(Artikel_Nummer);
CREATE INDEX IF NOT EXISTS idx_items_box ON items(BoxID);
`;

const UPSERT_ITEM_REFERENCE_SQL = `
  INSERT INTO item_refs (
    Artikel_Nummer, Grafikname, Artikelbeschreibung, Verkaufspreis, Kurzbeschreibung,
    Langtext, Hersteller, Länge_mm, Breite_mm, Höhe_mm, Gewicht_kg,
    Hauptkategorien_A, Unterkategorien_A, Hauptkategorien_B, Unterkategorien_B,
    Veröffentlicht_Status, Shopartikel, Artikeltyp, Einheit, WmsLink, EntityType
  )
  VALUES (
    @Artikel_Nummer, @Grafikname, @Artikelbeschreibung, @Verkaufspreis, @Kurzbeschreibung,
    @Langtext, @Hersteller, @Länge_mm, @Breite_mm, @Höhe_mm, @Gewicht_kg,
    @Hauptkategorien_A, @Unterkategorien_A, @Hauptkategorien_B, @Unterkategorien_B,
    @Veröffentlicht_Status, @Shopartikel, @Artikeltyp, @Einheit, @WmsLink, @EntityType
  )
  ON CONFLICT(Artikel_Nummer) DO UPDATE SET
    Grafikname=excluded.Grafikname,
    Artikelbeschreibung=excluded.Artikelbeschreibung,
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
    WmsLink=excluded.WmsLink,
    EntityType=excluded.EntityType
`;

const UPSERT_ITEM_INSTANCE_SQL = `
  INSERT INTO items (
    ItemUUID, Artikel_Nummer, BoxID, Location, UpdatedAt, Datum_erfasst, Auf_Lager
  )
  VALUES (
    @ItemUUID, @Artikel_Nummer, @BoxID, @Location, @UpdatedAt, @Datum_erfasst, @Auf_Lager
  )
  ON CONFLICT(ItemUUID) DO UPDATE SET
    Artikel_Nummer=excluded.Artikel_Nummer,
    BoxID=excluded.BoxID,
    Location=excluded.Location,
    UpdatedAt=excluded.UpdatedAt,
    Datum_erfasst=excluded.Datum_erfasst,
    Auf_Lager=excluded.Auf_Lager
`;

type ItemInstanceRow = {
  ItemUUID: string;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  Location: string | null;
  UpdatedAt: string;
  Datum_erfasst: string | null;
  Auf_Lager: number | null;
};

type ItemRefRow = {
  Artikel_Nummer: string;
  Grafikname: string | null;
  Artikelbeschreibung: string | null;
  Verkaufspreis: number | null;
  Kurzbeschreibung: string | null;
  Langtext: string | null;
  Hersteller: string | null;
  Länge_mm: number | null;
  Breite_mm: number | null;
  Höhe_mm: number | null;
  Gewicht_kg: number | null;
  Hauptkategorien_A: number | null;
  Unterkategorien_A: number | null;
  Hauptkategorien_B: number | null;
  Unterkategorien_B: number | null;
  Veröffentlicht_Status: string | null;
  Shopartikel: number | null;
  Artikeltyp: string | null;
  Einheit: string | null;
  WmsLink: string | null;
  EntityType: string | null;
};

type ItemPersistencePayload = {
  instance: ItemInstanceRow;
  ref: ItemRefRow | null;
  cleanupKey: string | null;
};

type ItemInstanceLookupRow = {
  Artikel_Nummer: string | null;
  Datum_erfasst: string | null;
};

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str;
}

function asNullableTrimmedString(value: unknown): string | null {
  const raw = asNullableString(value);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function asNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(num) ? num : null;
}

function asNullableFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

function normalizePublishedValue(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return value ? 'yes' : 'no';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return ['yes', 'ja', 'true', '1'].includes(trimmed.toLowerCase()) ? 'yes' : 'no';
  }
  return null;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed;
    }
    return parsed.toISOString();
  }
  return null;
}

function prepareInstanceRow(instance: ItemInstance): ItemInstanceRow {
  const artikelNummer = asNullableTrimmedString(instance.Artikel_Nummer);
  return {
    ItemUUID: instance.ItemUUID,
    Artikel_Nummer: artikelNummer,
    BoxID: instance.BoxID === undefined ? null : instance.BoxID,
    Location: instance.Location === undefined ? null : instance.Location ?? null,
    UpdatedAt: toIsoString(instance.UpdatedAt) || new Date().toISOString(),
    Datum_erfasst: toIsoString(instance.Datum_erfasst),
    Auf_Lager: asNullableInteger(instance.Auf_Lager)
  };
}

function prepareRefRow(ref: ItemRef): ItemRefRow {
  const artikelNummer = asNullableTrimmedString(ref.Artikel_Nummer);
  if (!artikelNummer) {
    throw new Error('Artikel_Nummer is required for item reference persistence');
  }
  return {
    Artikel_Nummer: artikelNummer,
    Grafikname: asNullableString(ref.Grafikname),
    Artikelbeschreibung: asNullableString(ref.Artikelbeschreibung),
    Verkaufspreis: asNullableFloat(ref.Verkaufspreis),
    Kurzbeschreibung: asNullableString(ref.Kurzbeschreibung),
    Langtext: asNullableString(ref.Langtext),
    Hersteller: asNullableString(ref.Hersteller),
    Länge_mm: asNullableInteger(ref.Länge_mm),
    Breite_mm: asNullableInteger(ref.Breite_mm),
    Höhe_mm: asNullableInteger(ref.Höhe_mm),
    Gewicht_kg: asNullableFloat(ref.Gewicht_kg),
    Hauptkategorien_A: asNullableInteger(ref.Hauptkategorien_A),
    Unterkategorien_A: asNullableInteger(ref.Unterkategorien_A),
    Hauptkategorien_B: asNullableInteger(ref.Hauptkategorien_B),
    Unterkategorien_B: asNullableInteger(ref.Unterkategorien_B),
    Veröffentlicht_Status: normalizePublishedValue(ref.Veröffentlicht_Status),
    Shopartikel: asNullableInteger(ref.Shopartikel),
    Artikeltyp: asNullableString(ref.Artikeltyp),
    Einheit: asNullableString(ref.Einheit),
    WmsLink: asNullableString(ref.WmsLink),
    EntityType: asNullableString(ref.EntityType)
  };
}

function prepareItemPersistencePayload(item: Item): ItemPersistencePayload {
  const instance = prepareInstanceRow(item);
  let cleanupKey: string | null = null;

  let existingInstance: ItemInstanceLookupRow | undefined;
  try {
    existingInstance = getItemInstanceByUuidStatement.get(instance.ItemUUID) as
      | ItemInstanceLookupRow
      | undefined;
  } catch (err) {
    console.error('Failed to lookup existing item instance', {
      itemUUID: instance.ItemUUID,
      error: err
    });
    throw err;
  }

  const providedArtikel = asNullableTrimmedString(instance.Artikel_Nummer);
  const existingArtikel = asNullableTrimmedString(existingInstance?.Artikel_Nummer ?? undefined);
  let resolvedArtikel = providedArtikel || existingArtikel || null;

  if (
    providedArtikel === instance.ItemUUID &&
    existingArtikel &&
    existingArtikel !== instance.ItemUUID
  ) {
    resolvedArtikel = existingArtikel;
  }

  const wasFallbackArtikel = resolvedArtikel !== null && resolvedArtikel === instance.ItemUUID;

  if (!resolvedArtikel || wasFallbackArtikel) {
    const previous = resolvedArtikel;
    resolvedArtikel = allocateArtikelNummerForItem(instance.ItemUUID, previous);
    instance.Artikel_Nummer = resolvedArtikel;
    if (previous === instance.ItemUUID || existingArtikel === instance.ItemUUID) {
      cleanupKey = instance.ItemUUID;
    }
  } else {
    instance.Artikel_Nummer = resolvedArtikel;
    if (existingArtikel && existingArtikel === instance.ItemUUID && existingArtikel !== resolvedArtikel) {
      cleanupKey = instance.ItemUUID;
    }
  }

  if (
    !item.Artikel_Nummer ||
    asNullableTrimmedString(item.Artikel_Nummer) === instance.ItemUUID
  ) {
    (item as Item).Artikel_Nummer = instance.Artikel_Nummer ?? undefined;
  }

  if (!instance.Datum_erfasst) {
    if (existingInstance?.Datum_erfasst) {
      instance.Datum_erfasst = existingInstance.Datum_erfasst;
    } else {
      instance.Datum_erfasst = instance.UpdatedAt;
      console.info('Defaulted Datum_erfasst for new item', {
        itemUUID: instance.ItemUUID,
        datumErfasst: instance.Datum_erfasst
      });
    }
  }

  let ref: ItemRefRow | null = null;
  try {
    ref = prepareRefRow({ ...(item as ItemRef), Artikel_Nummer: instance.Artikel_Nummer || resolvedArtikel || '' });
  } catch (err) {
    console.error('Failed to prepare item reference payload', {
      itemUUID: instance.ItemUUID,
      error: err
    });
    throw err;
  }

  return { instance, ref, cleanupKey };
}

function ensureItemTables(database: Database.Database = db): void {
  try {
    database.exec(CREATE_ITEM_REFS_SQL);
  } catch (err) {
    console.error('Failed to ensure item_refs schema', err);
    throw err;
  }

  try {
    database.exec(CREATE_ITEMS_SQL);
  } catch (err) {
    console.error('Failed to ensure items schema', err);
    throw err;
  }
}

ensureItemTables(db);

let upsertItemReferenceStatement: Database.Statement;
let upsertItemInstanceStatement: Database.Statement;
let deleteItemReferenceByKeyStatement: Database.Statement;
let getItemInstanceByUuidStatement: Database.Statement;
let getMaxArtikelNummerStatement: Database.Statement;
try {
  upsertItemReferenceStatement = db.prepare(UPSERT_ITEM_REFERENCE_SQL);
  upsertItemInstanceStatement = db.prepare(UPSERT_ITEM_INSTANCE_SQL);
  deleteItemReferenceByKeyStatement = db.prepare('DELETE FROM item_refs WHERE Artikel_Nummer = ?');
  getItemInstanceByUuidStatement = db.prepare(
    'SELECT Artikel_Nummer, Datum_erfasst FROM items WHERE ItemUUID = ?'
  );
  getMaxArtikelNummerStatement = db.prepare(`
    SELECT Artikel_Nummer FROM item_refs
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `);
} catch (err) {
  console.error('Failed to prepare item persistence statements', err);
  throw err;
}

function parseArtikelNummer(candidate: string | null | undefined): number | null {
  if (!candidate) return null;
  const parsed = parseInt(candidate, 10);
  if (!Number.isFinite(parsed)) {
    console.warn('Encountered non-numeric Artikel_Nummer while parsing', {
      candidate
    });
    return null;
  }
  return parsed;
}

function generateNextArtikelNummer(): string {
  const allocator = db.transaction(() => {
    const row = getMaxArtikelNummerStatement.get() as { Artikel_Nummer?: string } | undefined;
    const currentMax = parseArtikelNummer(row?.Artikel_Nummer ?? null) ?? 0;
    return String(currentMax + 1).padStart(5, '0');
  });

  try {
    return allocator();
  } catch (err) {
    console.error('Failed to allocate Artikel_Nummer within transaction', err);
    throw err;
  }
}

function allocateArtikelNummerForItem(itemUUID: string, previous: string | null): string {
  const next = generateNextArtikelNummer();
  console.info('Allocated Artikel_Nummer for item', {
    itemUUID,
    artikelNummer: next,
    previousArtikelNummer: previous
  });
  return next;
}

function runItemPersistenceStatements(payload: ItemPersistencePayload): void {
  if (payload.ref) {
    upsertItemReferenceStatement.run(payload.ref);
    if (
      payload.cleanupKey &&
      payload.cleanupKey !== payload.ref.Artikel_Nummer
    ) {
      deleteItemReferenceByKeyStatement.run(payload.cleanupKey);
    }
  }
  upsertItemInstanceStatement.run(payload.instance);
}

const ITEM_REFERENCE_JOIN_KEY = 'i.Artikel_Nummer';

const ITEM_JOIN_BASE = `
  FROM items i
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
`;

function itemSelectColumns(locationExpr: string): string {
  return `
SELECT
  i.ItemUUID AS ItemUUID,
  i.Artikel_Nummer AS Artikel_Nummer,
  i.BoxID AS BoxID,
  ${locationExpr} AS Location,
  i.UpdatedAt AS UpdatedAt,
  i.Datum_erfasst AS Datum_erfasst,
  i.Auf_Lager AS Auf_Lager,
  r.Grafikname AS Grafikname,
  r.Artikelbeschreibung AS Artikelbeschreibung,
  r.Verkaufspreis AS Verkaufspreis,
  r.Kurzbeschreibung AS Kurzbeschreibung,
  r.Langtext AS Langtext,
  r.Hersteller AS Hersteller,
  r.Länge_mm AS Länge_mm,
  r.Breite_mm AS Breite_mm,
  r.Höhe_mm AS Höhe_mm,
  r.Gewicht_kg AS Gewicht_kg,
  r.Hauptkategorien_A AS Hauptkategorien_A,
  r.Unterkategorien_A AS Unterkategorien_A,
  r.Hauptkategorien_B AS Hauptkategorien_B,
  r.Unterkategorien_B AS Unterkategorien_B,
  r.Veröffentlicht_Status AS Veröffentlicht_Status,
  r.Shopartikel AS Shopartikel,
  r.Artikeltyp AS Artikeltyp,
  r.Einheit AS Einheit,
  r.WmsLink AS WmsLink,
  r.EntityType AS EntityType
`;
}

export function persistItemReference(ref: ItemRef): void {
  try {
    const row = prepareRefRow(ref);
    upsertItemReferenceStatement.run(row);
  } catch (err) {
    console.error('Failed to persist item reference', { artikelNummer: ref.Artikel_Nummer, error: err });
    throw err;
  }
}

export function persistItemInstance(instance: ItemInstance): void {
  try {
    const row = prepareInstanceRow(instance);
    upsertItemInstanceStatement.run(row);
  } catch (err) {
    console.error('Failed to persist item instance', { itemUUID: instance.ItemUUID, error: err });
    throw err;
  }
}

export function persistItemWithinTransaction(item: Item): void {
  const payload = prepareItemPersistencePayload(item);
  try {
    runItemPersistenceStatements(payload);
  } catch (err) {
    console.error('Failed to persist item within transaction', { itemUUID: item.ItemUUID, error: err });
    throw err;
  }
}

export function persistItem(item: Item): void {
  const payload = prepareItemPersistencePayload(item);
  const txn = db.transaction((data: ItemPersistencePayload) => {
    runItemPersistenceStatements(data);
  });
  try {
    txn(payload);
  } catch (err) {
    console.error('Failed to persist item', { itemUUID: item.ItemUUID, error: err });
    throw err;
  }
}

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
  try {
    database.exec(createAgenticRunsSql);
  } catch (err) {
    console.error('Failed to ensure agentic_runs schema', err);
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

export const queueLabel = db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`);
export const getItem = db.prepare(
  `${itemSelectColumns('i.Location')}
${ITEM_JOIN_BASE}
WHERE i.ItemUUID = ?`
);
export const findByMaterial = db.prepare(
  `${itemSelectColumns('i.Location')}
${ITEM_JOIN_BASE}
WHERE i.Artikel_Nummer = ?
ORDER BY i.UpdatedAt DESC`
);
export const itemsByBox = db.prepare(
  `${itemSelectColumns('i.Location')}
${ITEM_JOIN_BASE}
WHERE i.BoxID = ?
ORDER BY i.ItemUUID`
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
         r.Artikelbeschreibung AS Artikelbeschreibung,
         COALESCE(i.Artikel_Nummer, r.Artikel_Nummer) AS Artikel_Nummer
  FROM events e
  LEFT JOIN items i ON e.EntityType='Item' AND e.EntityId = i.ItemUUID
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
  ORDER BY e.Id DESC LIMIT 3`);
export const listRecentActivities = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         r.Artikelbeschreibung AS Artikelbeschreibung,
         COALESCE(i.Artikel_Nummer, r.Artikel_Nummer) AS Artikel_Nummer
  FROM events e
  LEFT JOIN items i ON e.EntityType='Item' AND e.EntityId = i.ItemUUID
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
  ORDER BY e.CreatedAt DESC
  LIMIT @limit`);
export const countEvents = db.prepare(`SELECT COUNT(*) as c FROM events`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = db.prepare(`SELECT COUNT(*) as c FROM items`);
export const countItemsNoWms = db.prepare(`
  SELECT COUNT(*) as c
  FROM items i
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
  WHERE IFNULL(r.WmsLink, '') = ''
`);
export const countItemsNoBox = db.prepare(`SELECT COUNT(*) as c FROM items WHERE BoxID IS NULL OR BoxID = ''`);
export const listRecentBoxes = db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 5`);
export const getMaxBoxId = db.prepare(
  `SELECT BoxID FROM boxes ORDER BY CAST(substr(BoxID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxItemId = db.prepare(
  `SELECT ItemUUID FROM items ORDER BY CAST(substr(ItemUUID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxArtikelNummer = getMaxArtikelNummerStatement;

export const updateAgenticReview = db.prepare(`
  UPDATE agentic_runs
  SET ReviewState = @ReviewState,
      ReviewedBy = @ReviewedBy,
      LastModified = @LastModified
  WHERE ItemUUID = @ItemUUID
`);

export const listItems = db.prepare(
  `${itemSelectColumns('COALESCE(i.Location, b.Location)')}
${ITEM_JOIN_BASE}
  LEFT JOIN boxes b ON i.BoxID = b.BoxID
 ORDER BY i.ItemUUID`
);

export const listItemsForExport = db.prepare(
  `${itemSelectColumns('COALESCE(i.Location, b.Location)')}
${ITEM_JOIN_BASE}
  LEFT JOIN boxes b ON i.BoxID = b.BoxID
 WHERE (@createdAfter IS NULL OR i.Datum_erfasst >= @createdAfter)
   AND (@updatedAfter IS NULL OR i.UpdatedAt >= @updatedAfter)
 ORDER BY i.Datum_erfasst`
);

export type { AgenticRun, Box, Item, ItemInstance, ItemRef, LabelJob, EventLog };

