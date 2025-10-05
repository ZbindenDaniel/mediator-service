import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from './config';
import type {
  AgenticRun,
  Box,
  EventLog,
  ItemQuant,
  ItemRecord,
  ItemRef,
  LabelJob
} from '../models';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('Failed to initialize database', err);
  throw err;
}

function ensureCoreSchema(database: Database.Database): void {
  try {
    console.info('Ensuring core database schema');
    database.exec(`
CREATE TABLE IF NOT EXISTS boxes (
  BoxID TEXT PRIMARY KEY,
  Location TEXT,
  CreatedAt TEXT,
  Notes TEXT,
  PlacedBy TEXT,
  PlacedAt TEXT,
  UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_refs (
  RefID INTEGER PRIMARY KEY AUTOINCREMENT,
  RefKey TEXT NOT NULL UNIQUE,
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
  WmsLink TEXT,
  EntityType TEXT
);

CREATE TABLE IF NOT EXISTS item_quants (
  ItemUUID TEXT PRIMARY KEY,
  RefID INTEGER NOT NULL,
  BoxID TEXT,
  Location TEXT,
  UpdatedAt TEXT NOT NULL,
  Datum_erfasst TEXT,
  Auf_Lager INTEGER DEFAULT 0,
  FOREIGN KEY(RefID) REFERENCES item_refs(RefID) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY(BoxID) REFERENCES boxes(BoxID) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_refs_artikel ON item_refs(Artikel_Nummer);
CREATE INDEX IF NOT EXISTS idx_item_quants_box ON item_quants(BoxID);
CREATE INDEX IF NOT EXISTS idx_item_quants_ref ON item_quants(RefID);

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
    console.error('Failed to ensure core schema', err);
    throw err;
  }
}

ensureCoreSchema(db);
migrateLegacyItems(db);

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

function normaliseString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function deriveRefKey(payload: Partial<ItemRef> & { ItemUUID?: string | null }): string | null {
  const material = normaliseString(payload.Artikel_Nummer);
  if (material) {
    return material;
  }
  const itemId = normaliseString(payload.ItemUUID ?? null);
  if (itemId) {
    console.warn('Falling back to ItemUUID as reference key', { itemId });
    return itemId;
  }
  return null;
}

function normaliseNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseBooleanText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (['yes', 'ja', 'true', '1'].includes(lowered)) {
      return 'yes';
    }
    if (['no', 'nein', 'false', '0'].includes(lowered)) {
      return 'no';
    }
    return trimmed;
  }
  return null;
}

function serialiseDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function migrateLegacyItems(database: Database.Database): void {
  let hasLegacyTable = false;
  try {
    const meta = database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='items'`)
      .get() as { name?: string } | undefined;
    hasLegacyTable = Boolean(meta?.name);
  } catch (err) {
    console.error('Failed to inspect legacy items table', err);
    throw err;
  }

  if (!hasLegacyTable) {
    return;
  }

  let quantCount = 0;
  try {
    const countRow = database.prepare(`SELECT COUNT(*) AS c FROM item_quants`).get() as { c: number } | undefined;
    quantCount = countRow?.c ?? 0;
  } catch (err) {
    console.error('Failed to count existing item_quants rows', err);
    throw err;
  }

  if (quantCount > 0) {
    console.info('Skipping legacy item migration because item_quants already populated');
    return;
  }

  console.info('Migrating legacy items table into item_refs/item_quants');

  const selectLegacy = database.prepare(`SELECT * FROM items`);
  const insertRef = database.prepare(`
    INSERT INTO item_refs (
      RefKey,
      Artikel_Nummer,
      Grafikname,
      Artikelbeschreibung,
      Verkaufspreis,
      Kurzbeschreibung,
      Langtext,
      Hersteller,
      Länge_mm,
      Breite_mm,
      Höhe_mm,
      Gewicht_kg,
      Hauptkategorien_A,
      Unterkategorien_A,
      Hauptkategorien_B,
      Unterkategorien_B,
      Veröffentlicht_Status,
      Shopartikel,
      Artikeltyp,
      Einheit,
      WmsLink,
      EntityType
    ) VALUES (
      @RefKey,
      @Artikel_Nummer,
      @Grafikname,
      @Artikelbeschreibung,
      @Verkaufspreis,
      @Kurzbeschreibung,
      @Langtext,
      @Hersteller,
      @Länge_mm,
      @Breite_mm,
      @Höhe_mm,
      @Gewicht_kg,
      @Hauptkategorien_A,
      @Unterkategorien_A,
      @Hauptkategorien_B,
      @Unterkategorien_B,
      @Veröffentlicht_Status,
      @Shopartikel,
      @Artikeltyp,
      @Einheit,
      @WmsLink,
      @EntityType
    )
    ON CONFLICT(RefKey) DO UPDATE SET
      Artikel_Nummer=COALESCE(excluded.Artikel_Nummer, item_refs.Artikel_Nummer),
      Grafikname=COALESCE(excluded.Grafikname, item_refs.Grafikname),
      Artikelbeschreibung=COALESCE(excluded.Artikelbeschreibung, item_refs.Artikelbeschreibung),
      Verkaufspreis=COALESCE(excluded.Verkaufspreis, item_refs.Verkaufspreis),
      Kurzbeschreibung=COALESCE(excluded.Kurzbeschreibung, item_refs.Kurzbeschreibung),
      Langtext=COALESCE(excluded.Langtext, item_refs.Langtext),
      Hersteller=COALESCE(excluded.Hersteller, item_refs.Hersteller),
      Länge_mm=COALESCE(excluded.Länge_mm, item_refs.Länge_mm),
      Breite_mm=COALESCE(excluded.Breite_mm, item_refs.Breite_mm),
      Höhe_mm=COALESCE(excluded.Höhe_mm, item_refs.Höhe_mm),
      Gewicht_kg=COALESCE(excluded.Gewicht_kg, item_refs.Gewicht_kg),
      Hauptkategorien_A=COALESCE(excluded.Hauptkategorien_A, item_refs.Hauptkategorien_A),
      Unterkategorien_A=COALESCE(excluded.Unterkategorien_A, item_refs.Unterkategorien_A),
      Hauptkategorien_B=COALESCE(excluded.Hauptkategorien_B, item_refs.Hauptkategorien_B),
      Unterkategorien_B=COALESCE(excluded.Unterkategorien_B, item_refs.Unterkategorien_B),
      Veröffentlicht_Status=COALESCE(excluded.Veröffentlicht_Status, item_refs.Veröffentlicht_Status),
      Shopartikel=COALESCE(excluded.Shopartikel, item_refs.Shopartikel),
      Artikeltyp=COALESCE(excluded.Artikeltyp, item_refs.Artikeltyp),
      Einheit=COALESCE(excluded.Einheit, item_refs.Einheit),
      WmsLink=COALESCE(excluded.WmsLink, item_refs.WmsLink),
      EntityType=COALESCE(excluded.EntityType, item_refs.EntityType)
  `);
  const selectRefId = database.prepare(`SELECT RefID FROM item_refs WHERE RefKey = ?`);
  const insertQuant = database.prepare(`
    INSERT INTO item_quants (
      ItemUUID,
      RefID,
      BoxID,
      Location,
      UpdatedAt,
      Datum_erfasst,
      Auf_Lager
    ) VALUES (
      @ItemUUID,
      @RefID,
      @BoxID,
      @Location,
      @UpdatedAt,
      @Datum_erfasst,
      @Auf_Lager
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      RefID=excluded.RefID,
      BoxID=excluded.BoxID,
      Location=excluded.Location,
      UpdatedAt=excluded.UpdatedAt,
      Datum_erfasst=excluded.Datum_erfasst,
      Auf_Lager=excluded.Auf_Lager
  `);

  try {
    database.transaction(() => {
      const legacyRows = selectLegacy.all() as Record<string, unknown>[];
      for (const row of legacyRows) {
        const refKey = deriveRefKey({
          Artikel_Nummer: row.Artikel_Nummer as string | undefined,
          ItemUUID: row.ItemUUID as string | undefined
        });
        if (!refKey) {
          console.error('Skipping legacy row without reference key', { row });
          continue;
        }

        insertRef.run({
          RefKey: refKey,
          Artikel_Nummer: normaliseString(row.Artikel_Nummer) ?? null,
          Grafikname: normaliseString(row.Grafikname) ?? null,
          Artikelbeschreibung: normaliseString(row.Artikelbeschreibung) ?? null,
          Verkaufspreis: normaliseNumber(row.Verkaufspreis),
          Kurzbeschreibung: normaliseString(row.Kurzbeschreibung) ?? null,
          Langtext: normaliseString(row.Langtext) ?? null,
          Hersteller: normaliseString(row.Hersteller) ?? null,
          Länge_mm: normaliseNumber(row.Länge_mm),
          Breite_mm: normaliseNumber(row.Breite_mm),
          Höhe_mm: normaliseNumber(row.Höhe_mm),
          Gewicht_kg: normaliseNumber(row.Gewicht_kg),
          Hauptkategorien_A: row.Hauptkategorien_A ?? null,
          Unterkategorien_A: row.Unterkategorien_A ?? null,
          Hauptkategorien_B: row.Hauptkategorien_B ?? null,
          Unterkategorien_B: row.Unterkategorien_B ?? null,
          Veröffentlicht_Status: normaliseBooleanText(row.Veröffentlicht_Status),
          Shopartikel: normaliseNumber(row.Shopartikel),
          Artikeltyp: normaliseString(row.Artikeltyp) ?? null,
          Einheit: normaliseString(row.Einheit) ?? null,
          WmsLink: normaliseString(row.WmsLink) ?? null,
          EntityType: normaliseString(row.EntityType) ?? null
        });

        const refIdRow = selectRefId.get(refKey) as { RefID: number } | undefined;
        if (!refIdRow) {
          console.error('Failed to resolve RefID for legacy row', { refKey, row });
          continue;
        }

        const updatedAt = serialiseDate(row.UpdatedAt as string | null | undefined) ?? new Date().toISOString();
        const datumErfasst = serialiseDate(row.Datum_erfasst as string | null | undefined);
        const quantity = normaliseNumber(row.Auf_Lager);

        insertQuant.run({
          ItemUUID: row.ItemUUID,
          RefID: refIdRow.RefID,
          BoxID: normaliseString(row.BoxID),
          Location: normaliseString(row.Location),
          UpdatedAt: updatedAt,
          Datum_erfasst: datumErfasst,
          Auf_Lager: quantity ?? 0
        });
      }

      database.exec(`DROP TABLE IF EXISTS items`);
    })();
    console.info('Legacy items migration complete');
  } catch (err) {
    console.error('Failed to migrate legacy items', err);
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
  FOREIGN KEY(ItemUUID) REFERENCES item_quants(ItemUUID) ON DELETE CASCADE ON UPDATE CASCADE
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
const ITEM_RECORD_COLUMNS = `
  q.ItemUUID AS ItemUUID,
  q.BoxID AS BoxID,
  q.Location AS Location,
  q.UpdatedAt AS UpdatedAt,
  q.Datum_erfasst AS Datum_erfasst,
  q.Auf_Lager AS Auf_Lager,
  r.Artikel_Nummer AS Artikel_Nummer,
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

const ITEM_RECORD_FROM = `
  FROM item_quants q
  JOIN item_refs r ON q.RefID = r.RefID
`;

const upsertBoxStatement = db.prepare(
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

const upsertItemRefStatement = db.prepare(`
  INSERT INTO item_refs (
    RefKey,
    Artikel_Nummer,
    Grafikname,
    Artikelbeschreibung,
    Verkaufspreis,
    Kurzbeschreibung,
    Langtext,
    Hersteller,
    Länge_mm,
    Breite_mm,
    Höhe_mm,
    Gewicht_kg,
    Hauptkategorien_A,
    Unterkategorien_A,
    Hauptkategorien_B,
    Unterkategorien_B,
    Veröffentlicht_Status,
    Shopartikel,
    Artikeltyp,
    Einheit,
    WmsLink,
    EntityType
  ) VALUES (
    @RefKey,
    @Artikel_Nummer,
    @Grafikname,
    @Artikelbeschreibung,
    @Verkaufspreis,
    @Kurzbeschreibung,
    @Langtext,
    @Hersteller,
    @Länge_mm,
    @Breite_mm,
    @Höhe_mm,
    @Gewicht_kg,
    @Hauptkategorien_A,
    @Unterkategorien_A,
    @Hauptkategorien_B,
    @Unterkategorien_B,
    @Veröffentlicht_Status,
    @Shopartikel,
    @Artikeltyp,
    @Einheit,
    @WmsLink,
    @EntityType
  )
  ON CONFLICT(RefKey) DO UPDATE SET
    Artikel_Nummer=COALESCE(excluded.Artikel_Nummer, item_refs.Artikel_Nummer),
    Grafikname=COALESCE(excluded.Grafikname, item_refs.Grafikname),
    Artikelbeschreibung=COALESCE(excluded.Artikelbeschreibung, item_refs.Artikelbeschreibung),
    Verkaufspreis=COALESCE(excluded.Verkaufspreis, item_refs.Verkaufspreis),
    Kurzbeschreibung=COALESCE(excluded.Kurzbeschreibung, item_refs.Kurzbeschreibung),
    Langtext=COALESCE(excluded.Langtext, item_refs.Langtext),
    Hersteller=COALESCE(excluded.Hersteller, item_refs.Hersteller),
    Länge_mm=COALESCE(excluded.Länge_mm, item_refs.Länge_mm),
    Breite_mm=COALESCE(excluded.Breite_mm, item_refs.Breite_mm),
    Höhe_mm=COALESCE(excluded.Höhe_mm, item_refs.Höhe_mm),
    Gewicht_kg=COALESCE(excluded.Gewicht_kg, item_refs.Gewicht_kg),
    Hauptkategorien_A=COALESCE(excluded.Hauptkategorien_A, item_refs.Hauptkategorien_A),
    Unterkategorien_A=COALESCE(excluded.Unterkategorien_A, item_refs.Unterkategorien_A),
    Hauptkategorien_B=COALESCE(excluded.Hauptkategorien_B, item_refs.Hauptkategorien_B),
    Unterkategorien_B=COALESCE(excluded.Unterkategorien_B, item_refs.Unterkategorien_B),
    Veröffentlicht_Status=COALESCE(excluded.Veröffentlicht_Status, item_refs.Veröffentlicht_Status),
    Shopartikel=COALESCE(excluded.Shopartikel, item_refs.Shopartikel),
    Artikeltyp=COALESCE(excluded.Artikeltyp, item_refs.Artikeltyp),
    Einheit=COALESCE(excluded.Einheit, item_refs.Einheit),
    WmsLink=COALESCE(excluded.WmsLink, item_refs.WmsLink),
    EntityType=COALESCE(excluded.EntityType, item_refs.EntityType)
`);

const selectRefIdByKey = db.prepare(`SELECT RefID FROM item_refs WHERE RefKey = ?`);

const upsertItemQuantStatement = db.prepare(`
  INSERT INTO item_quants (
    ItemUUID,
    RefID,
    BoxID,
    Location,
    UpdatedAt,
    Datum_erfasst,
    Auf_Lager
  ) VALUES (
    @ItemUUID,
    @RefID,
    @BoxID,
    @Location,
    @UpdatedAt,
    @Datum_erfasst,
    @Auf_Lager
  )
  ON CONFLICT(ItemUUID) DO UPDATE SET
    RefID=excluded.RefID,
    BoxID=excluded.BoxID,
    Location=excluded.Location,
    UpdatedAt=excluded.UpdatedAt,
    Datum_erfasst=excluded.Datum_erfasst,
    Auf_Lager=excluded.Auf_Lager
`);

const updateQuantPlacementStatement = db.prepare(`
  UPDATE item_quants
     SET BoxID=@BoxID,
         Location=@Location,
         UpdatedAt=datetime('now')
   WHERE ItemUUID=@ItemUUID
`);

const incrementQuantStatement = db.prepare(`
  UPDATE item_quants
     SET Auf_Lager=COALESCE(Auf_Lager, 0) + 1,
         UpdatedAt=datetime('now')
   WHERE ItemUUID = ?
`);

const decrementQuantStatement = db.prepare(`
  UPDATE item_quants
     SET Auf_Lager = COALESCE(Auf_Lager, 0) - 1,
         BoxID = CASE WHEN COALESCE(Auf_Lager, 0) - 1 <= 0 THEN NULL ELSE BoxID END,
         Location = CASE WHEN COALESCE(Auf_Lager, 0) - 1 <= 0 THEN NULL ELSE Location END,
         UpdatedAt = datetime('now')
   WHERE ItemUUID = ? AND COALESCE(Auf_Lager, 0) > 0
`);

const deleteItemStatement = db.prepare(`DELETE FROM item_quants WHERE ItemUUID = ?`);

const getItemStatement = db.prepare(`
  SELECT ${ITEM_RECORD_COLUMNS}
  ${ITEM_RECORD_FROM}
  WHERE q.ItemUUID = ?
`);

const findByMaterialStatement = db.prepare(`
  SELECT ${ITEM_RECORD_COLUMNS}
  ${ITEM_RECORD_FROM}
  WHERE r.Artikel_Nummer = ?
  ORDER BY q.UpdatedAt DESC
`);

const itemsByBoxStatement = db.prepare(`
  SELECT ${ITEM_RECORD_COLUMNS}
  ${ITEM_RECORD_FROM}
  WHERE q.BoxID = ?
  ORDER BY q.ItemUUID
`);

const listItemsStatement = db.prepare(`
  SELECT ${ITEM_RECORD_COLUMNS.replace('q.Location AS Location', 'COALESCE(q.Location, b.Location) AS Location')}
  ${ITEM_RECORD_FROM}
  LEFT JOIN boxes b ON q.BoxID = b.BoxID
  ORDER BY q.ItemUUID
`);

const listItemsForExportStatement = db.prepare(`
  SELECT ${ITEM_RECORD_COLUMNS.replace('q.Location AS Location', 'COALESCE(q.Location, b.Location) AS Location')}
  ${ITEM_RECORD_FROM}
  LEFT JOIN boxes b ON q.BoxID = b.BoxID
  WHERE (@createdAfter IS NULL OR q.Datum_erfasst >= @createdAfter)
    AND (@updatedAfter IS NULL OR q.UpdatedAt >= @updatedAfter)
  ORDER BY q.Datum_erfasst
`);

const listRecentEventsStatement = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         r.Artikelbeschreibung, r.Artikel_Nummer
    FROM events e
    LEFT JOIN item_quants q ON e.EntityType='Item' AND e.EntityId = q.ItemUUID
    LEFT JOIN item_refs r ON q.RefID = r.RefID
   ORDER BY e.Id DESC
   LIMIT 3
`);

const listRecentActivitiesStatement = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Meta,
         r.Artikelbeschreibung, r.Artikel_Nummer
    FROM events e
    LEFT JOIN item_quants q ON e.EntityType='Item' AND e.EntityId = q.ItemUUID
    LEFT JOIN item_refs r ON q.RefID = r.RefID
   ORDER BY e.Id DESC
   LIMIT @limit
`);

const countItemsStatement = db.prepare(`SELECT COUNT(*) as c FROM item_quants`);
const countItemsNoWmsStatement = db.prepare(`
  SELECT COUNT(*) as c
    FROM item_quants q
    JOIN item_refs r ON q.RefID = r.RefID
   WHERE IFNULL(TRIM(r.WmsLink),'') = ''
`);
const countItemsNoBoxStatement = db.prepare(`
  SELECT COUNT(*) as c
    FROM item_quants
   WHERE BoxID IS NULL OR BoxID = ''
`);

const getMaxItemIdStatement = db.prepare(`
  SELECT ItemUUID FROM item_quants ORDER BY CAST(substr(ItemUUID, 10) AS INTEGER) DESC LIMIT 1
`);

const getMaxArtikelNummerStatement = db.prepare(`
    SELECT Artikel_Nummer FROM item_refs
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `);

export function upsertBox(payload: Box): void {
  try {
    upsertBoxStatement.run(payload);
  } catch (err) {
    console.error('Failed to upsert box', { boxId: payload.BoxID, error: err });
    throw err;
  }
}

function buildItemRefPayload(ref: ItemRef, refKey: string): Record<string, unknown> {
  return {
    RefKey: refKey,
    Artikel_Nummer: normaliseString(ref.Artikel_Nummer) ?? null,
    Grafikname: normaliseString(ref.Grafikname) ?? null,
    Artikelbeschreibung: normaliseString(ref.Artikelbeschreibung) ?? null,
    Verkaufspreis: normaliseNumber(ref.Verkaufspreis),
    Kurzbeschreibung: normaliseString(ref.Kurzbeschreibung) ?? null,
    Langtext: normaliseString(ref.Langtext) ?? null,
    Hersteller: normaliseString(ref.Hersteller) ?? null,
    Länge_mm: normaliseNumber(ref.Länge_mm),
    Breite_mm: normaliseNumber(ref.Breite_mm),
    Höhe_mm: normaliseNumber(ref.Höhe_mm),
    Gewicht_kg: normaliseNumber(ref.Gewicht_kg),
    Hauptkategorien_A: ref.Hauptkategorien_A ?? null,
    Unterkategorien_A: ref.Unterkategorien_A ?? null,
    Hauptkategorien_B: ref.Hauptkategorien_B ?? null,
    Unterkategorien_B: ref.Unterkategorien_B ?? null,
    Veröffentlicht_Status: normaliseBooleanText(ref.Veröffentlicht_Status),
    Shopartikel: normaliseNumber(ref.Shopartikel),
    Artikeltyp: normaliseString(ref.Artikeltyp) ?? null,
    Einheit: normaliseString(ref.Einheit) ?? null,
    WmsLink: normaliseString(ref.WmsLink) ?? null,
    EntityType: normaliseString(ref.EntityType) ?? null
  };
}

function buildItemQuantPayload(quant: ItemQuant & { RefID: number }): Record<string, unknown> {
  return {
    ItemUUID: quant.ItemUUID,
    RefID: quant.RefID,
    BoxID: normaliseString(quant.BoxID ?? null),
    Location: normaliseString(quant.Location ?? null),
    UpdatedAt: serialiseDate(quant.UpdatedAt) ?? new Date().toISOString(),
    Datum_erfasst: serialiseDate(quant.Datum_erfasst ?? null),
    Auf_Lager: normaliseNumber(quant.Auf_Lager ?? null) ?? 0
  };
}

export function upsertItemRef(ref: ItemRef): number {
  const refKey = deriveRefKey(ref);
  if (!refKey) {
    const error = new Error('Cannot derive reference key for item ref');
    console.error('Failed to upsert item ref due to missing key', { ref });
    throw error;
  }
  const payload = buildItemRefPayload(ref, refKey);
  try {
    upsertItemRefStatement.run(payload);
  } catch (err) {
    console.error('Failed to upsert item ref', { refKey, error: err });
    throw err;
  }
  const refIdRow = selectRefIdByKey.get(refKey) as { RefID: number } | undefined;
  if (!refIdRow) {
    const error = new Error('Failed to resolve RefID after upsert');
    console.error('Failed to resolve RefID after upsert', { refKey });
    throw error;
  }
  return refIdRow.RefID;
}

export function upsertItemQuant(quant: ItemQuant & { RefID: number }): void {
  const payload = buildItemQuantPayload(quant);
  try {
    upsertItemQuantStatement.run(payload);
  } catch (err) {
    console.error('Failed to upsert item quant', { itemId: quant.ItemUUID, error: err });
    throw err;
  }
}

export function upsertItemRecord(record: ItemRecord): number {
  const refId = upsertItemRef(record);
  upsertItemQuant({ ...record, RefID: refId });
  return refId;
}

export function updateQuantPlacement(itemUUID: string, boxId: string | null, location: string | null): void {
  try {
    updateQuantPlacementStatement.run({
      ItemUUID: itemUUID,
      BoxID: normaliseString(boxId) ?? null,
      Location: normaliseString(location) ?? null
    });
  } catch (err) {
    console.error('Failed to update item placement', { itemId: itemUUID, error: err });
    throw err;
  }
}

export function incrementQuant(itemUUID: string): void {
  try {
    incrementQuantStatement.run(itemUUID);
  } catch (err) {
    console.error('Failed to increment item quantity', { itemId: itemUUID, error: err });
    throw err;
  }
}

export function decrementQuant(itemUUID: string): void {
  try {
    decrementQuantStatement.run(itemUUID);
  } catch (err) {
    console.error('Failed to decrement item quantity', { itemId: itemUUID, error: err });
    throw err;
  }
}

export function deleteItem(itemUUID: string): void {
  try {
    deleteItemStatement.run(itemUUID);
  } catch (err) {
    console.error('Failed to delete item', { itemId: itemUUID, error: err });
    throw err;
  }
}

export const queueLabel = db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`);
export const getItem = getItemStatement;
export const findByMaterial = findByMaterialStatement;
export const itemsByBox = itemsByBoxStatement;
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
export const listRecentEvents = listRecentEventsStatement;
export const listRecentActivities = listRecentActivitiesStatement;
export const countEvents = db.prepare(`SELECT COUNT(*) as c FROM events`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = countItemsStatement;
export const countItemsNoWms = countItemsNoWmsStatement;
export const countItemsNoBox = countItemsNoBoxStatement;
export const listRecentBoxes = db.prepare(`SELECT BoxID, Location, UpdatedAt FROM boxes ORDER BY UpdatedAt DESC LIMIT 4`);
export const getMaxBoxId = db.prepare(
  `SELECT BoxID FROM boxes ORDER BY CAST(substr(BoxID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxItemId = getMaxItemIdStatement;
export const getMaxArtikelNummer = getMaxArtikelNummerStatement;
export const updateAgenticReview = db.prepare(`
  UPDATE agentic_runs
  SET ReviewState = @ReviewState,
      ReviewedBy = @ReviewedBy,
      LastModified = @LastModified
  WHERE ItemUUID = @ItemUUID
`);
export const listItems = listItemsStatement;
export const listItemsForExport = listItemsForExportStatement;

export type { AgenticRun, Box, ItemQuant, ItemRecord, ItemRef, LabelJob, EventLog };

