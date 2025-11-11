import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
// TODO(agent): Monitor structured Langtext serialization to retire legacy string normalization once migrations complete.
import { DB_PATH } from './config';
import { parseLangtext, stringifyLangtext } from './lib/langtext';
import type {
  ShopwareSyncQueueEntry,
  ShopwareSyncQueueInsert,
  ShopwareSyncQueueStatus
} from './shopware/queueTypes';
import {
  AgenticRequestLog,
  AgenticRequestLogUpsert,
  AgenticRequestNotification,
  AgenticRun,
  Box,
  Item,
  ItemInstance,
  ItemRef,
  LabelJob,
  EventLog,
  EventLogLevel,
  EVENT_LOG_LEVELS,
  parseEventLogLevelAllowList,
  resolveEventLogLevel
} from '../models';
import { resolveStandortLabel } from './standort-label';

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
  StandortLabel TEXT,
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
  Level TEXT NOT NULL DEFAULT 'Information',
  Meta TEXT
);

CREATE TABLE IF NOT EXISTS shopware_sync_queue (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  CorrelationId TEXT NOT NULL,
  JobType TEXT NOT NULL,
  Payload TEXT NOT NULL,
  Status TEXT NOT NULL DEFAULT 'queued',
  RetryCount INTEGER NOT NULL DEFAULT 0,
  LastError TEXT,
  LastAttemptAt TEXT,
  NextAttemptAt TEXT,
  CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_status ON shopware_sync_queue(Status);
CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_status_attempt
  ON shopware_sync_queue (Status, COALESCE(NextAttemptAt, '1970-01-01'), Id);

CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_correlation
  ON shopware_sync_queue (CorrelationId);
`);
} catch (err) {
  console.error('Failed to create schema', err);
  throw err;
}

function ensureStandortLabelColumn(database: Database.Database = db): void {
  let hasColumn = false;
  try {
    const columns = database.prepare(`PRAGMA table_info(boxes)`).all() as Array<{ name: string }>;
    hasColumn = columns.some((column) => column.name === 'StandortLabel');
  } catch (err) {
    console.error('Failed to inspect boxes schema for StandortLabel column', err);
    throw err;
  }

  if (hasColumn) {
    return;
  }

  console.info('Adding StandortLabel column to boxes table for existing deployments');

  try {
    database.prepare('ALTER TABLE boxes ADD COLUMN StandortLabel TEXT').run();
  } catch (err) {
    console.error('Failed to add StandortLabel column to boxes table', err);
    throw err;
  }

  try {
    const selectBoxes = database.prepare('SELECT BoxID, Location FROM boxes');
    const updateLabel = database.prepare('UPDATE boxes SET StandortLabel = @StandortLabel WHERE BoxID = @BoxID');
    const rows = selectBoxes.all() as Array<{ BoxID: string; Location: string | null }>;
    const backfill = database.transaction((entries: Array<{ BoxID: string; Location: string | null }>) => {
      for (const entry of entries) {
        const label = resolveStandortLabel(entry.Location);
        if (!label && entry.Location) {
          console.warn('No StandortLabel mapping found during backfill', { location: entry.Location });
        }
        updateLabel.run({ BoxID: entry.BoxID, StandortLabel: label });
      }
    });
    backfill(rows);
    console.info('Backfilled StandortLabel for existing boxes', { count: rows.length });
  } catch (err) {
    console.error('Failed to backfill StandortLabel values for boxes', err);
    throw err;
  }
}

ensureStandortLabelColumn();

const rawEventLogLevels = process.env.EVENT_LOG_LEVELS ?? null;
const {
  levels: resolvedLevels,
  invalid: invalidEventLogLevels,
  hadInput: hadEventLogLevelInput,
  usedFallback: usedEventLogFallback
} = parseEventLogLevelAllowList(rawEventLogLevels);

if (!hadEventLogLevelInput) {
  console.info('[db] EVENT_LOG_LEVELS not configured; defaulting to all event levels.');
} else {
  if (invalidEventLogLevels.length > 0) {
    console.warn('[db] EVENT_LOG_LEVELS contains unknown values; ignoring invalid entries.', {
      invalid: invalidEventLogLevels
    });
  }
  if (usedEventLogFallback) {
    console.warn('[db] EVENT_LOG_LEVELS produced no recognized levels; defaulting to all levels.');
  }
}

const computedAllowList = resolvedLevels.length > 0 ? resolvedLevels : [...EVENT_LOG_LEVELS];

if (resolvedLevels.length === 0) {
  console.warn('[db] EVENT_LOG_LEVEL_ALLOW_LIST resolved empty; reverting to full level set.');
}

export const EVENT_LOG_LEVEL_ALLOW_LIST: readonly EventLogLevel[] = Object.freeze([
  ...computedAllowList
]);

const EVENT_LOG_LEVEL_SQL_LIST = EVENT_LOG_LEVEL_ALLOW_LIST
  .map((level) => `'${level.replace(/'/g, "''")}'`)
  .join(', ');

function levelFilterExpression(alias?: string): string {
  if (EVENT_LOG_LEVEL_ALLOW_LIST.length === 0) {
    return '0';
  }

  const column = alias ? `${alias}.Level` : 'Level';
  return `${column} IN (${EVENT_LOG_LEVEL_SQL_LIST})`;
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
  EntityType TEXT,
  ShopwareProductId TEXT
);
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
  ShopwareVariantId TEXT,
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
    Veröffentlicht_Status, Shopartikel, Artikeltyp, Einheit, EntityType, ShopwareProductId
  )
  VALUES (
    @Artikel_Nummer, @Grafikname, @Artikelbeschreibung, @Verkaufspreis, @Kurzbeschreibung,
    @Langtext, @Hersteller, @Länge_mm, @Breite_mm, @Höhe_mm, @Gewicht_kg,
    @Hauptkategorien_A, @Unterkategorien_A, @Hauptkategorien_B, @Unterkategorien_B,
    @Veröffentlicht_Status, @Shopartikel, @Artikeltyp, @Einheit, @EntityType, @ShopwareProductId
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
    EntityType=excluded.EntityType,
    ShopwareProductId=excluded.ShopwareProductId
`;

const UPSERT_ITEM_INSTANCE_SQL = `
  INSERT INTO items (
    ItemUUID, Artikel_Nummer, BoxID, Location, UpdatedAt, Datum_erfasst, Auf_Lager, ShopwareVariantId
  )
  VALUES (
    @ItemUUID, @Artikel_Nummer, @BoxID, @Location, @UpdatedAt, @Datum_erfasst, @Auf_Lager, @ShopwareVariantId
  )
  ON CONFLICT(ItemUUID) DO UPDATE SET
    Artikel_Nummer=excluded.Artikel_Nummer,
    BoxID=excluded.BoxID,
    Location=excluded.Location,
    UpdatedAt=excluded.UpdatedAt,
    Datum_erfasst=excluded.Datum_erfasst,
    Auf_Lager=excluded.Auf_Lager,
    ShopwareVariantId=excluded.ShopwareVariantId
`;

type ItemInstanceRow = {
  ItemUUID: string;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  Location: string | null;
  UpdatedAt: string;
  Datum_erfasst: string | null;
  Auf_Lager: number | null;
  ShopwareVariantId: string | null;
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
  EntityType: string | null;
  ShopwareProductId: string | null;
};

function parseLangtextForRow<T extends Record<string, unknown>>(
  row: T,
  context: string
): T {
  if (!row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, 'Langtext')) {
    return row;
  }
  const rawValue = (row as Record<string, unknown>).Langtext;
  const artikelNummer = typeof row.Artikel_Nummer === 'string' ? row.Artikel_Nummer : null;
  const itemUUID = typeof row.ItemUUID === 'string' ? row.ItemUUID : null;
  const parsed = parseLangtext(rawValue, {
    logger: console,
    context,
    artikelNummer,
    itemUUID
  });
  return {
    ...row,
    Langtext: parsed ?? (rawValue === undefined ? null : (rawValue as string | null))
  } as T;
}

function wrapLangtextAwareStatement<T extends Database.Statement>(
  statement: T,
  context: string
): T {
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      if (prop === 'get') {
        return (...args: unknown[]) => {
          const row = target.get.apply(target, args as any[]) as unknown;
          if (!row || typeof row !== 'object') {
            return row;
          }
          return parseLangtextForRow({ ...(row as Record<string, unknown>) }, `${context}:get`);
        };
      }
      if (prop === 'all') {
        return (...args: unknown[]) => {
          const rows = target.all.apply(target, args as any[]) as unknown[];
          return rows.map((row, index) => {
            if (!row || typeof row !== 'object') {
              return row;
            }
            return parseLangtextForRow({ ...(row as Record<string, unknown>) }, `${context}:all#${index}`);
          });
        };
      }
      if (prop === 'iterate') {
        return (...args: unknown[]) => {
          const iterator = target.iterate.apply(target, args as any[]) as IterableIterator<unknown>;
          function* generator(): IterableIterator<unknown> {
            let index = 0;
            for (const row of iterator) {
              if (row && typeof row === 'object') {
                yield parseLangtextForRow({ ...(row as Record<string, unknown>) }, `${context}:iter#${index}`);
              } else {
                yield row;
              }
              index += 1;
            }
          }
          return generator();
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  };
  return new Proxy(statement, handler) as T;
}

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
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      console.warn('[db] Attempted to serialize invalid Date instance', { value });
      return null;
    }
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      console.warn('[db] Attempted to normalize invalid date string', { value: trimmed });
      return null;
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
    Auf_Lager: asNullableInteger(instance.Auf_Lager),
    ShopwareVariantId: asNullableTrimmedString((instance as ItemInstance & { ShopwareVariantId?: string | null }).ShopwareVariantId)
  };
}

function prepareRefRow(ref: ItemRef): ItemRefRow {
  const artikelNummer = asNullableTrimmedString(ref.Artikel_Nummer);
  if (!artikelNummer) {
    throw new Error('Artikel_Nummer is required for item reference persistence');
  }
  const serializedLangtext = stringifyLangtext(ref.Langtext ?? null, {
    logger: console,
    context: 'prepareRefRow',
    artikelNummer
  });
  return {
    Artikel_Nummer: artikelNummer,
    Grafikname: asNullableString(ref.Grafikname),
    Artikelbeschreibung: asNullableString(ref.Artikelbeschreibung),
    Verkaufspreis: asNullableFloat(ref.Verkaufspreis),
    Kurzbeschreibung: asNullableString(ref.Kurzbeschreibung),
    Langtext: serializedLangtext ?? null,
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
    EntityType: asNullableString(ref.EntityType),
    ShopwareProductId: asNullableString((ref as ItemRef & { ShopwareProductId?: string | null }).ShopwareProductId)
  };
}

type ItemPersistenceDirectives = {
  __skipReferencePersistence?: boolean;
  __referenceRowOverride?: ItemRef | null;
};

type ItemPersistencePayload = {
  instance: ItemInstanceRow;
  ref: ItemRefRow | null;
};

function prepareItemPersistencePayload(item: Item): ItemPersistencePayload {
  const instance = prepareInstanceRow(item);

  const directives = item as Item & ItemPersistenceDirectives;
  const skipReferencePersistence = directives.__skipReferencePersistence === true;
  const referenceOverride = directives.__referenceRowOverride ?? null;

  if ('__skipReferencePersistence' in directives) {
    delete directives.__skipReferencePersistence;
  }
  if ('__referenceRowOverride' in directives) {
    delete directives.__referenceRowOverride;
  }

  let preparedOverride: ItemRefRow | null = null;
  if (referenceOverride) {
    try {
      preparedOverride = prepareRefRow(referenceOverride);
    } catch (err) {
      console.error('[db] Failed to normalize reference override for item persistence', {
        artikelNummer: referenceOverride.Artikel_Nummer,
        itemUUID: instance.ItemUUID,
        error: err
      });
      throw err;
    }
  }

  if (!instance.Artikel_Nummer && preparedOverride) {
    instance.Artikel_Nummer = preparedOverride.Artikel_Nummer;
  }

  const referenceKey = instance.Artikel_Nummer ?? preparedOverride?.Artikel_Nummer ?? instance.ItemUUID;

  if (!instance.Artikel_Nummer && !preparedOverride) {
    // TODO: Backfill existing deployments to remove duplicate item_ref rows once Artikel_Nummer values are assigned.
    console.info('[db] Persisting item reference with ItemUUID fallback key', {
      itemUUID: instance.ItemUUID
    });
  }

  try {
    const ref = preparedOverride ?? prepareRefRow({ ...(item as ItemRef), Artikel_Nummer: referenceKey });
    return { instance, ref: skipReferencePersistence ? null : ref };
  } catch (err) {
    console.error('Failed to prepare item reference payload', {
      itemUUID: instance.ItemUUID,
      error: err
    });
    throw err;
  }
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

const LOCATION_WITH_BOX_FALLBACK = "COALESCE(NULLIF(i.Location,''), NULLIF(b.Location,''))";

const ITEM_REFERENCE_JOIN_KEY = "COALESCE(NULLIF(i.Artikel_Nummer,''), i.ItemUUID)";

const ITEM_JOIN_BASE = `
  FROM items i
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
`;

ensureItemTables(db);
const ITEM_JOIN_WITH_BOX = `${ITEM_JOIN_BASE}
  LEFT JOIN boxes b ON i.BoxID = b.BoxID
`;

function ensureItemShopwareColumns(database: Database.Database = db): void {
  let refColumns: Array<{ name: string }> = [];
  try {
    refColumns = database.prepare(`PRAGMA table_info(item_refs)`).all() as Array<{ name: string }>; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
  } catch (err) {
    console.error('Failed to inspect item_refs schema for Shopware columns', err);
    throw err;
  }

  if (!refColumns.some((column) => column.name === 'ShopwareProductId')) {
    try {
      database.prepare('ALTER TABLE item_refs ADD COLUMN ShopwareProductId TEXT').run();
      console.info('[db] Added ShopwareProductId column to item_refs');
    } catch (err) {
      console.error('Failed to add ShopwareProductId column to item_refs', err);
      throw err;
    }
  }

  let itemColumns: Array<{ name: string }> = [];
  try {
    itemColumns = database.prepare(`PRAGMA table_info(items)`).all() as Array<{ name: string }>; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
  } catch (err) {
    console.error('Failed to inspect items schema for Shopware columns', err);
    throw err;
  }

  if (!itemColumns.some((column) => column.name === 'ShopwareVariantId')) {
    try {
      database.prepare('ALTER TABLE items ADD COLUMN ShopwareVariantId TEXT').run();
      console.info('[db] Added ShopwareVariantId column to items');
    } catch (err) {
      console.error('Failed to add ShopwareVariantId column to items', err);
      throw err;
    }
  }
}

ensureItemShopwareColumns(db);

let upsertItemReferenceStatement: Database.Statement;
let upsertItemInstanceStatement: Database.Statement;
let getItemReferenceStatement: Database.Statement;
let getMaxArtikelNummerStatement: Database.Statement;
let getItemStatement: Database.Statement;
let findByMaterialStatement: Database.Statement;
let itemsByBoxStatement: Database.Statement;
try {
  upsertItemReferenceStatement = db.prepare(UPSERT_ITEM_REFERENCE_SQL);
  upsertItemInstanceStatement = db.prepare(UPSERT_ITEM_INSTANCE_SQL);
  getItemReferenceStatement = db.prepare(`
    SELECT
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
      EntityType,
      ShopwareProductId
    FROM item_refs
    WHERE Artikel_Nummer = ?
  `);
  getMaxArtikelNummerStatement = db.prepare(`
    SELECT Artikel_Nummer FROM item_refs
    WHERE Artikel_Nummer IS NOT NULL AND Artikel_Nummer != ''
    ORDER BY CAST(Artikel_Nummer AS INTEGER) DESC
    LIMIT 1
  `);
  getItemStatement = db.prepare(`
${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}
${ITEM_JOIN_WITH_BOX}
WHERE i.ItemUUID = ?
`);
  findByMaterialStatement = db.prepare(`
${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}
${ITEM_JOIN_WITH_BOX}
WHERE i.Artikel_Nummer = ?
ORDER BY i.UpdatedAt DESC
`);
  itemsByBoxStatement = db.prepare(`
${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}
${ITEM_JOIN_WITH_BOX}
WHERE i.BoxID = ?
ORDER BY i.ItemUUID
`);
} catch (err) {
  console.error('Failed to prepare item persistence statements', err);
  throw err;
}

function runItemPersistenceStatements(payload: ItemPersistencePayload): void {
  if (payload.ref) {
    upsertItemReferenceStatement.run(payload.ref);
  }
  upsertItemInstanceStatement.run(payload.instance);
}

function createShopwareQueuePayload(payload: unknown, context: string): string {
  try {
    return JSON.stringify(payload ?? null);
  } catch (err) {
    console.error('[db] Failed to serialize Shopware queue payload', { context, error: err });
    throw err;
  }
}

let shopwareCorrelationCounter = 0;

function normaliseCorrelationSegment(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  const sanitized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return sanitized || fallback;
}

function nextShopwareCorrelationSequence(): string {
  shopwareCorrelationCounter = (shopwareCorrelationCounter + 1) % 1679616; // 36^5 ~= 60M rotations
  return shopwareCorrelationCounter.toString(36).padStart(5, '0');
}

export function generateShopwareCorrelationId(context: string, itemUUID: string | undefined): string {
  try {
    const contextSegment = normaliseCorrelationSegment(context, 'job');
    const itemSegment = itemUUID ? normaliseCorrelationSegment(itemUUID, 'item') : 'item';
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
    const sequence = nextShopwareCorrelationSequence();
    const entropy = randomBytes(3).toString('hex');
    return `${contextSegment}:${itemSegment}:${timestamp}:${sequence}:${entropy}`;
  } catch (err) {
    console.error('[db] Failed to generate Shopware queue correlation id', { context, itemUUID, error: err });
    throw err;
  }
}

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
  i.ShopwareVariantId AS ShopwareVariantId,
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
  CAST(r.Hauptkategorien_A AS INTEGER) AS Hauptkategorien_A,
  CAST(r.Unterkategorien_A AS INTEGER) AS Unterkategorien_A,
  CAST(r.Hauptkategorien_B AS INTEGER) AS Hauptkategorien_B,
  CAST(r.Unterkategorien_B AS INTEGER) AS Unterkategorien_B,
  r.Veröffentlicht_Status AS Veröffentlicht_Status,
  r.Shopartikel AS Shopartikel,
  r.Artikeltyp AS Artikeltyp,
  r.Einheit AS Einheit,
  r.EntityType AS EntityType,
  r.ShopwareProductId AS ShopwareProductId
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
    try {
      const correlationId = generateShopwareCorrelationId('persistItem', data.instance.ItemUUID);
      const payload = createShopwareQueuePayload(
        {
          artikelNummer: data.instance.Artikel_Nummer ?? null,
          boxId: data.instance.BoxID ?? null,
          itemUUID: data.instance.ItemUUID,
          trigger: 'persistItem'
        },
        'persistItem'
      );
      enqueueShopwareSyncJob({
        CorrelationId: correlationId,
        JobType: 'item-upsert',
        Payload: payload
      });
    } catch (error) {
      console.error('[db] Failed to enqueue Shopware sync job during persistItem transaction', {
        itemUUID: data.instance.ItemUUID,
        error
      });
    }
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
  LastReviewDecision TEXT,
  LastReviewNotes TEXT,
  RetryCount INTEGER NOT NULL DEFAULT 0,
  NextRetryAt TEXT,
  LastError TEXT,
  LastAttemptAt TEXT,
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

  ensureAgenticRunQueueColumns(database);
}

function ensureAgenticRunQueueColumns(database: Database.Database = db): void {
  let columns: Array<{ name: string }> = [];
  try {
    columns = database.prepare(`PRAGMA table_info(agentic_runs)`).all() as Array<{ name: string }>;
  } catch (err) {
    console.error('Failed to inspect agentic_runs schema for queue metadata columns', err);
    throw err;
  }

  const hasColumn = (column: string) => columns.some((entry) => entry.name === column);

  const alterations: Array<{ name: string; sql: string }> = [];
  if (!hasColumn('RetryCount')) {
    alterations.push({ name: 'RetryCount', sql: 'ALTER TABLE agentic_runs ADD COLUMN RetryCount INTEGER NOT NULL DEFAULT 0' });
  }
  if (!hasColumn('NextRetryAt')) {
    alterations.push({ name: 'NextRetryAt', sql: "ALTER TABLE agentic_runs ADD COLUMN NextRetryAt TEXT" });
  }
  if (!hasColumn('LastError')) {
    alterations.push({ name: 'LastError', sql: "ALTER TABLE agentic_runs ADD COLUMN LastError TEXT" });
  }
  if (!hasColumn('LastAttemptAt')) {
    alterations.push({ name: 'LastAttemptAt', sql: "ALTER TABLE agentic_runs ADD COLUMN LastAttemptAt TEXT" });
  }
  if (!hasColumn('LastReviewDecision')) {
    alterations.push({ name: 'LastReviewDecision', sql: "ALTER TABLE agentic_runs ADD COLUMN LastReviewDecision TEXT" });
  }
  if (!hasColumn('LastReviewNotes')) {
    alterations.push({ name: 'LastReviewNotes', sql: "ALTER TABLE agentic_runs ADD COLUMN LastReviewNotes TEXT" });
  }

  const addedColumns: string[] = [];
  for (const { name, sql } of alterations) {
    try {
      database.prepare(sql).run();
      addedColumns.push(name);
      console.info('[db] Added missing agentic_runs column', name);
    } catch (err) {
      console.error('Failed to add agentic_runs column', name, err);
      throw err;
    }
  }

  try {
    const result = database.prepare(
      `UPDATE agentic_runs
          SET LastReviewDecision = LOWER(TRIM(ReviewState))
        WHERE ReviewState IN ('approved', 'rejected')
          AND (LastReviewDecision IS NULL OR TRIM(LastReviewDecision) = '')`
    ).run();
    if ((result?.changes ?? 0) > 0) {
      console.info('[db] Backfilled LastReviewDecision for agentic_runs rows', {
        count: result?.changes ?? 0,
        addedColumns
      });
    }
  } catch (err) {
    console.error('Failed to backfill LastReviewDecision values for agentic_runs', err);
    throw err;
  }
}

const CREATE_AGENTIC_REQUEST_LOGS_SQL = `
CREATE TABLE IF NOT EXISTS agentic_request_logs (
  UUID TEXT PRIMARY KEY,
  Search TEXT,
  Status TEXT,
  Error TEXT,
  CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  NotifiedAt TEXT,
  LastNotificationError TEXT,
  PayloadJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentic_request_logs_status ON agentic_request_logs(Status);
CREATE INDEX IF NOT EXISTS idx_agentic_request_logs_notification_pending
  ON agentic_request_logs (Status, NotifiedAt, UpdatedAt)
  WHERE Status = 'SUCCESS' AND NotifiedAt IS NULL;
`;

function ensureAgenticRequestLogSchema(database: Database.Database = db): void {
  try {
    database.exec(CREATE_AGENTIC_REQUEST_LOGS_SQL);
  } catch (err) {
    console.error('Failed to ensure agentic_request_logs schema', err);
    throw err;
  }

  ensureAgenticRequestLogColumns(database);
}

function ensureAgenticRequestLogColumns(database: Database.Database = db): void {
  let columns: Array<{ name: string }> = [];
  try {
    columns = database.prepare(`PRAGMA table_info(agentic_request_logs)`).all() as Array<{ name: string }>;
  } catch (err) {
    console.error('Failed to inspect agentic_request_logs schema for missing columns', err);
    throw err;
  }

  const hasColumn = (column: string) => columns.some((entry) => entry.name === column);

  const alterations: Array<{ name: string; sql: string }> = [];
  if (!hasColumn('NotifiedAt')) {
    alterations.push({ name: 'NotifiedAt', sql: "ALTER TABLE agentic_request_logs ADD COLUMN NotifiedAt TEXT" });
  }
  if (!hasColumn('LastNotificationError')) {
    alterations.push({
      name: 'LastNotificationError',
      sql: 'ALTER TABLE agentic_request_logs ADD COLUMN LastNotificationError TEXT'
    });
  }
  if (!hasColumn('PayloadJson')) {
    alterations.push({ name: 'PayloadJson', sql: "ALTER TABLE agentic_request_logs ADD COLUMN PayloadJson TEXT" });
  }

  for (const { name, sql } of alterations) {
    try {
      database.prepare(sql).run();
      console.info('[db] Added missing agentic_request_logs column', name);
    } catch (err) {
      console.error('Failed to add agentic_request_logs column', name, err);
      throw err;
    }
  }

  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_agentic_request_logs_status ON agentic_request_logs(Status);
      CREATE INDEX IF NOT EXISTS idx_agentic_request_logs_notification_pending
        ON agentic_request_logs (Status, NotifiedAt, UpdatedAt)
        WHERE Status = 'SUCCESS' AND NotifiedAt IS NULL;
    `);
  } catch (err) {
    console.error('Failed to ensure agentic_request_logs indexes', err);
    throw err;
  }
}

ensureAgenticRequestLogSchema(db);
ensureAgenticRunSchema(db);

export { db };

export const upsertBox = db.prepare(
  `
      INSERT INTO boxes (BoxID, Location, StandortLabel, CreatedAt, Notes, PlacedBy, PlacedAt, UpdatedAt)
      VALUES (@BoxID, @Location, @StandortLabel, @CreatedAt, @Notes, @PlacedBy, @PlacedAt, @UpdatedAt)
      ON CONFLICT(BoxID) DO UPDATE SET
      Location=COALESCE(excluded.Location, boxes.Location),
      StandortLabel=COALESCE(excluded.StandortLabel, boxes.StandortLabel),
      CreatedAt=COALESCE(excluded.CreatedAt, boxes.CreatedAt),
      Notes=COALESCE(excluded.Notes, boxes.Notes),
      PlacedBy=COALESCE(excluded.PlacedBy, boxes.PlacedBy),
      PlacedAt=COALESCE(excluded.PlacedAt, boxes.PlacedAt),
      UpdatedAt=excluded.UpdatedAt
  `
);

export const queueLabel = db.prepare(`INSERT INTO label_queue (ItemUUID, CreatedAt) VALUES (?, datetime('now'))`);
export const getItem = wrapLangtextAwareStatement(getItemStatement, 'db:getItem');
export const getItemReference = wrapLangtextAwareStatement(
  getItemReferenceStatement,
  'db:getItemReference'
);
export const findByMaterial = wrapLangtextAwareStatement(findByMaterialStatement, 'db:findByMaterial');
export const itemsByBox = wrapLangtextAwareStatement(itemsByBoxStatement, 'db:itemsByBox');
export const getBox = db.prepare(`SELECT * FROM boxes WHERE BoxID = ?`);
export const listBoxes = db.prepare(`SELECT * FROM boxes ORDER BY BoxID`);

const upsertAgenticRequestLogStatement = db.prepare(
  `
    INSERT INTO agentic_request_logs (
      UUID, Search, Status, Error, CreatedAt, UpdatedAt, NotifiedAt, LastNotificationError, PayloadJson
    )
    VALUES (
      @UUID,
      @Search,
      @Status,
      @Error,
      COALESCE(@CreatedAt, datetime('now')),
      COALESCE(@UpdatedAt, datetime('now')),
      @NotifiedAt,
      @LastNotificationError,
      @PayloadJson
    )
    ON CONFLICT(UUID) DO UPDATE SET
      Search=COALESCE(excluded.Search, agentic_request_logs.Search),
      Status=COALESCE(excluded.Status, agentic_request_logs.Status),
      Error=CASE WHEN @ErrorIsSet THEN excluded.Error ELSE agentic_request_logs.Error END,
      UpdatedAt=COALESCE(excluded.UpdatedAt, agentic_request_logs.UpdatedAt),
      NotifiedAt=COALESCE(excluded.NotifiedAt, agentic_request_logs.NotifiedAt),
      LastNotificationError=CASE
        WHEN @LastNotificationErrorIsSet THEN excluded.LastNotificationError
        ELSE agentic_request_logs.LastNotificationError
      END,
      PayloadJson=COALESCE(excluded.PayloadJson, agentic_request_logs.PayloadJson)
  `
);

const startAgenticRequestLogStatement = db.prepare(
  `
    INSERT INTO agentic_request_logs (UUID, Search, Status, Error, CreatedAt, UpdatedAt, LastNotificationError)
    VALUES (@UUID, @Search, @Status, NULL, @Now, @Now, NULL)
    ON CONFLICT(UUID) DO UPDATE SET
      Search=excluded.Search,
      Status=excluded.Status,
      Error=NULL,
      UpdatedAt=excluded.UpdatedAt,
      LastNotificationError=NULL,
      NotifiedAt=NULL,
      PayloadJson=NULL
  `
);

const completeAgenticRequestLogStatement = db.prepare(
  `
    UPDATE agentic_request_logs
       SET Status = @Status,
           Error = @Error,
           UpdatedAt = @Now
     WHERE UUID = @UUID
  `
);

const saveAgenticRequestPayloadStatement = db.prepare(
  `
    UPDATE agentic_request_logs
       SET PayloadJson = @PayloadJson,
           UpdatedAt = @Now
     WHERE UUID = @UUID
  `
);

const markAgenticRequestNotificationSuccessStatement = db.prepare(
  `
    UPDATE agentic_request_logs
       SET NotifiedAt = @NotifiedAt,
           LastNotificationError = NULL,
           UpdatedAt = @UpdatedAt
     WHERE UUID = @UUID
  `
);

const markAgenticRequestNotificationFailureStatement = db.prepare(
  `
    UPDATE agentic_request_logs
       SET LastNotificationError = @Error,
           UpdatedAt = @UpdatedAt
     WHERE UUID = @UUID
  `
);

const selectPendingAgenticRequestNotificationsStatement = db.prepare(
  `
    SELECT UUID, PayloadJson
      FROM agentic_request_logs
     WHERE Status = 'SUCCESS'
       AND NotifiedAt IS NULL
       AND PayloadJson IS NOT NULL
     ORDER BY UpdatedAt ASC
     LIMIT @Limit
  `
);

const getAgenticRequestLogStatement = db.prepare(
  `
    SELECT UUID, Search, Status, Error, CreatedAt, UpdatedAt, NotifiedAt, LastNotificationError, PayloadJson
      FROM agentic_request_logs
     WHERE UUID = ?
  `
);

type AgenticRequestNotificationRow = {
  UUID: string;
  PayloadJson: string | null;
};

function resolveAgenticRequestPayload(json: string | null, uuid: string): unknown {
  if (json === null) {
    return null;
  }

  try {
    return JSON.parse(json);
  } catch (err) {
    console.error('[db] Failed to parse agentic request payload_json', { uuid, error: err });
    return null;
  }
}

export function upsertAgenticRequestLog(log: AgenticRequestLogUpsert): void {
  const uuid = typeof log.UUID === 'string' ? log.UUID.trim() : '';
  if (!uuid) {
    console.warn('[db] Skipping agentic request log upsert due to missing UUID');
    return;
  }

  const now = new Date().toISOString();
  const createdAt = toIsoString(log.CreatedAt) ?? log.CreatedAt ?? now;
  const updatedAt = toIsoString(log.UpdatedAt) ?? log.UpdatedAt ?? now;
  const notifiedAt = toIsoString(log.NotifiedAt) ?? null;
  const errorIsSet = Object.prototype.hasOwnProperty.call(log, 'Error');
  const lastNotificationErrorIsSet = Object.prototype.hasOwnProperty.call(log, 'LastNotificationError');

  const payload = {
    UUID: uuid,
    Search: asNullableTrimmedString(log.Search),
    Status: asNullableTrimmedString(log.Status),
    Error: errorIsSet ? asNullableString(log.Error) : null,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
    NotifiedAt: notifiedAt,
    LastNotificationError: lastNotificationErrorIsSet ? asNullableString(log.LastNotificationError) : null,
    PayloadJson: log.PayloadJson ?? null,
    ErrorIsSet: errorIsSet ? 1 : 0,
    LastNotificationErrorIsSet: lastNotificationErrorIsSet ? 1 : 0
  };

  try {
    upsertAgenticRequestLogStatement.run(payload);
  } catch (err) {
    console.error('[db] Failed to upsert agentic_request_logs row', { uuid, error: err });
    throw err;
  }
}

export function logAgenticRequestStart(uuid: string, search: string | null): void {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    console.warn('[db] Cannot persist agentic request start without UUID');
    return;
  }

  const now = new Date().toISOString();
  try {
    startAgenticRequestLogStatement.run({
      UUID: trimmedUuid,
      Search: asNullableTrimmedString(search),
      Status: 'RUNNING',
      Now: now
    });
  } catch (err) {
    console.error('[db] Failed to persist agentic request start', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export function logAgenticRequestEnd(uuid: string, status: string, error: string | null): void {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    console.warn('[db] Cannot persist agentic request completion without UUID');
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = completeAgenticRequestLogStatement.run({
      UUID: trimmedUuid,
      Status: asNullableTrimmedString(status),
      Error: asNullableString(error),
      Now: now
    });

    if ((result?.changes ?? 0) === 0) {
      console.warn('[db] Agentic request completion updated zero rows; inserting fallback entry', { uuid: trimmedUuid });
      upsertAgenticRequestLog({
        UUID: trimmedUuid,
        Status: status,
        Error: error,
        UpdatedAt: now
      });
    }
  } catch (err) {
    console.error('[db] Failed to persist agentic request completion', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export function saveAgenticRequestPayload(uuid: string, payload: unknown): void {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    console.warn('[db] Cannot persist agentic request payload without UUID');
    return;
  }

  let payloadJson: string | null = null;
  try {
    payloadJson = JSON.stringify(payload ?? null);
  } catch (err) {
    console.error('[db] Failed to serialize agentic request payload', { uuid: trimmedUuid, error: err });
  }

  const now = new Date().toISOString();
  try {
    const result = saveAgenticRequestPayloadStatement.run({
      UUID: trimmedUuid,
      PayloadJson: payloadJson,
      Now: now
    });

    if ((result?.changes ?? 0) === 0) {
      console.warn('[db] Agentic request payload update affected zero rows; inserting fallback entry', {
        uuid: trimmedUuid
      });
      upsertAgenticRequestLog({
        UUID: trimmedUuid,
        PayloadJson: payloadJson,
        UpdatedAt: now
      });
    }
  } catch (err) {
    console.error('[db] Failed to persist agentic request payload', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export function markAgenticRequestNotificationSuccess(uuid: string, completedAtIso: string | null = null): void {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    console.warn('[db] Cannot mark agentic request notification success without UUID');
    return;
  }

  const now = new Date().toISOString();
  const notifiedAt = toIsoString(completedAtIso) ?? now;
  try {
    const result = markAgenticRequestNotificationSuccessStatement.run({
      UUID: trimmedUuid,
      NotifiedAt: notifiedAt,
      UpdatedAt: now
    });

    if ((result?.changes ?? 0) === 0) {
      console.warn('[db] Agentic notification success update affected zero rows; inserting fallback entry', {
        uuid: trimmedUuid
      });
      upsertAgenticRequestLog({
        UUID: trimmedUuid,
        NotifiedAt: notifiedAt,
        LastNotificationError: null,
        UpdatedAt: now
      });
    }
  } catch (err) {
    console.error('[db] Failed to mark agentic notification success', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export function markAgenticRequestNotificationFailure(uuid: string, errorMessage: string): void {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    console.warn('[db] Cannot mark agentic request notification failure without UUID');
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = markAgenticRequestNotificationFailureStatement.run({
      UUID: trimmedUuid,
      Error: asNullableString(errorMessage),
      UpdatedAt: now
    });

    if ((result?.changes ?? 0) === 0) {
      console.warn('[db] Agentic notification failure update affected zero rows; inserting fallback entry', {
        uuid: trimmedUuid
      });
      upsertAgenticRequestLog({
        UUID: trimmedUuid,
        LastNotificationError: errorMessage,
        UpdatedAt: now
      });
    }
  } catch (err) {
    console.error('[db] Failed to mark agentic notification failure', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export function listPendingAgenticRequestNotifications(limit = 10): AgenticRequestNotification[] {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

  let rows: AgenticRequestNotificationRow[] = [];
  try {
    rows = selectPendingAgenticRequestNotificationsStatement.all({ Limit: effectiveLimit }) as AgenticRequestNotificationRow[];
  } catch (err) {
    console.error('[db] Failed to query pending agentic request notifications', { limit: effectiveLimit, error: err });
    throw err;
  }

  const notifications: AgenticRequestNotification[] = [];
  for (const row of rows) {
    const payload = resolveAgenticRequestPayload(row.PayloadJson, row.UUID);
    if (payload !== null) {
      notifications.push({ UUID: row.UUID, Payload: payload });
    }
  }

  return notifications;
}

export function getAgenticRequestLog(uuid: string): AgenticRequestLog | null {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) {
    return null;
  }

  try {
    const row = getAgenticRequestLogStatement.get(trimmedUuid) as AgenticRequestLog | undefined;
    return row ?? null;
  } catch (err) {
    console.error('[db] Failed to load agentic_request_logs row', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export const upsertAgenticRun = db.prepare(
  `
    INSERT INTO agentic_runs (
      ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy, LastReviewDecision, LastReviewNotes
    )
    VALUES (
      @ItemUUID, @SearchQuery, @Status, @LastModified, @ReviewState, @ReviewedBy, @LastReviewDecision, @LastReviewNotes
    )
    ON CONFLICT(ItemUUID) DO UPDATE SET
      SearchQuery=COALESCE(excluded.SearchQuery, agentic_runs.SearchQuery),
      Status=excluded.Status,
      LastModified=excluded.LastModified,
      ReviewState=excluded.ReviewState,
      ReviewedBy=excluded.ReviewedBy,
      LastReviewDecision=COALESCE(excluded.LastReviewDecision, agentic_runs.LastReviewDecision),
      LastReviewNotes=COALESCE(excluded.LastReviewNotes, agentic_runs.LastReviewNotes),
      RetryCount=CASE WHEN excluded.Status = 'queued' THEN 0 ELSE agentic_runs.RetryCount END,
      NextRetryAt=CASE WHEN excluded.Status = 'queued' THEN NULL ELSE agentic_runs.NextRetryAt END,
      LastError=CASE WHEN excluded.Status = 'queued' THEN NULL ELSE agentic_runs.LastError END,
      LastAttemptAt=CASE WHEN excluded.Status = 'queued' THEN NULL ELSE agentic_runs.LastAttemptAt END
  `
);
export const getAgenticRun = db.prepare(`
  SELECT Id, ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy,
         LastReviewDecision, LastReviewNotes,
         RetryCount, NextRetryAt, LastError, LastAttemptAt
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
           ReviewedBy=@ReviewedBy,
           LastReviewDecision=COALESCE(@LastReviewDecision, LastReviewDecision),
           LastReviewNotes=COALESCE(@LastReviewNotes, LastReviewNotes)
     WHERE ItemUUID=@ItemUUID
  `
);

const selectQueuedAgenticRuns = db.prepare(`
  SELECT Id, ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy,
         LastReviewDecision, LastReviewNotes,
         RetryCount, NextRetryAt, LastError, LastAttemptAt
  FROM agentic_runs
  WHERE Status = 'queued'
    AND (NextRetryAt IS NULL OR datetime(NextRetryAt) <= datetime('now'))
  ORDER BY datetime(LastModified) ASC, Id ASC
  LIMIT @limit
`);

const updateQueuedAgenticRunQueueStatement = db.prepare(`
  UPDATE agentic_runs
     SET Status = COALESCE(@Status, Status),
         LastModified = @LastModified,
         RetryCount = @RetryCount,
         NextRetryAt = @NextRetryAt,
         LastError = @LastError,
         LastAttemptAt = @LastAttemptAt
   WHERE ItemUUID = @ItemUUID
`);

export type AgenticRunQueueUpdate = {
  ItemUUID: string;
  Status?: string | null;
  LastModified: string;
  RetryCount: number;
  NextRetryAt: string | null;
  LastError: string | null;
  LastAttemptAt: string;
};

export function fetchQueuedAgenticRuns(limit = 5): AgenticRun[] {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  try {
    return selectQueuedAgenticRuns.all({ limit: effectiveLimit }) as AgenticRun[];
  } catch (err) {
    console.error('[db] Failed to fetch queued agentic runs', err);
    throw err;
  }
}

export function updateQueuedAgenticRunQueueState(update: AgenticRunQueueUpdate): void {
  const payload = {
    ...update,
    Status: update.Status ?? null,
    NextRetryAt: update.NextRetryAt ?? null,
    LastError: update.LastError ?? null
  };

  try {
    const result = updateQueuedAgenticRunQueueStatement.run(payload);
    if ((result?.changes ?? 0) === 0) {
      console.warn('[db] Agentic run queue update had no effect', { itemUUID: update.ItemUUID });
    }
  } catch (err) {
    console.error('[db] Failed to update queued agentic run state', { itemUUID: update.ItemUUID, error: err });
    throw err;
  }
}


export const nextLabelJob = db.prepare(`SELECT * FROM label_queue WHERE Status = 'Queued' ORDER BY Id LIMIT 1`);
export const updateLabelJobStatus = db.prepare(`UPDATE label_queue SET Status = ?, Error = ? WHERE Id = ?`);

const insertShopwareSyncJob = db.prepare(`
  INSERT INTO shopware_sync_queue (
    CorrelationId,
    JobType,
    Payload,
    Status,
    RetryCount,
    LastError,
    LastAttemptAt,
    NextAttemptAt,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @CorrelationId,
    @JobType,
    @Payload,
    @Status,
    @RetryCount,
    @LastError,
    @LastAttemptAt,
    @NextAttemptAt,
    datetime('now'),
    datetime('now')
  )
`);

const getShopwareSyncJobByIdStatement = db.prepare(`SELECT * FROM shopware_sync_queue WHERE Id = ?`);

const clearShopwareSyncQueueStatement = db.prepare(`DELETE FROM shopware_sync_queue`);
const listShopwareSyncQueueStatement = db.prepare(`SELECT * FROM shopware_sync_queue ORDER BY Id`);

export function clearShopwareSyncQueue(): void {
  try {
    clearShopwareSyncQueueStatement.run();
  } catch (err) {
    console.error('[db] Failed to clear Shopware sync queue', err);
    throw err;
  }
}

export function listShopwareSyncQueue(): ShopwareSyncQueueEntry[] {
  try {
    return listShopwareSyncQueueStatement.all() as ShopwareSyncQueueEntry[];
  } catch (err) {
    console.error('[db] Failed to list Shopware sync queue entries', err);
    throw err;
  }
}

export function enqueueShopwareSyncJob(job: ShopwareSyncQueueInsert): ShopwareSyncQueueEntry {
  const entry = {
    CorrelationId: job.CorrelationId,
    JobType: job.JobType,
    Payload: job.Payload,
    Status: job.Status ?? 'queued',
    RetryCount: job.RetryCount ?? 0,
    LastError: job.LastError ?? null,
    LastAttemptAt: job.LastAttemptAt ?? null,
    NextAttemptAt: job.NextAttemptAt ?? null
  };

  try {
    const result = insertShopwareSyncJob.run(entry);
    const inserted = getShopwareSyncJobByIdStatement.get(result.lastInsertRowid) as ShopwareSyncQueueEntry | undefined;
    if (!inserted) {
      throw new Error('Failed to fetch inserted Shopware sync job');
    }
    return inserted;
  } catch (err) {
    console.error('[db] Failed to enqueue Shopware sync job', {
      correlationId: job.CorrelationId,
      jobType: job.JobType,
      error: err
    });
    throw err;
  }
}

const selectDueShopwareSyncJobs = db.prepare(`
  SELECT *
  FROM shopware_sync_queue
  WHERE Status = 'queued'
    AND (NextAttemptAt IS NULL OR NextAttemptAt <= @Now)
  ORDER BY CreatedAt ASC, Id ASC
  LIMIT @Limit
`);

const markShopwareSyncJobProcessing = db.prepare(`
  UPDATE shopware_sync_queue
  SET Status = 'processing',
      LastAttemptAt = @LastAttemptAt,
      UpdatedAt = @LastAttemptAt
  WHERE Id = @Id
    AND Status = 'queued'
`);

export function claimShopwareSyncJobs(limit: number, attemptIso: string): ShopwareSyncQueueEntry[] {
  const candidates = selectDueShopwareSyncJobs.all({ Now: attemptIso, Limit: limit }) as ShopwareSyncQueueEntry[];
  if (!candidates.length) {
    return [];
  }

  const claimed: ShopwareSyncQueueEntry[] = [];
  const claimTxn = db.transaction((jobs: ShopwareSyncQueueEntry[]) => {
    for (const job of jobs) {
      try {
        const result = markShopwareSyncJobProcessing.run({ Id: job.Id, LastAttemptAt: attemptIso });
        if (result.changes > 0) {
          claimed.push({
            ...job,
            Status: 'processing',
            LastAttemptAt: attemptIso,
            UpdatedAt: attemptIso
          });
        }
      } catch (err) {
        console.error('[db] Failed to mark Shopware sync job as processing', {
          jobId: job.Id,
          error: err
        });
        throw err;
      }
    }
  });

  try {
    claimTxn(candidates);
  } catch (err) {
    console.error('[db] Failed to claim Shopware sync jobs', err);
    throw err;
  }

  return claimed;
}

const markShopwareSyncJobSucceededStatement = db.prepare(`
  UPDATE shopware_sync_queue
  SET Status = 'succeeded',
      RetryCount = 0,
      LastError = NULL,
      NextAttemptAt = NULL,
      UpdatedAt = @UpdatedAt
  WHERE Id = @Id
`);

export function markShopwareSyncJobSucceeded(id: number, completedAtIso: string): void {
  try {
    markShopwareSyncJobSucceededStatement.run({ Id: id, UpdatedAt: completedAtIso });
  } catch (err) {
    console.error('[db] Failed to mark Shopware sync job succeeded', { jobId: id, error: err });
    throw err;
  }
}

const rescheduleShopwareSyncJobStatement = db.prepare(`
  UPDATE shopware_sync_queue
  SET Status = 'queued',
      RetryCount = @RetryCount,
      LastError = @LastError,
      NextAttemptAt = @NextAttemptAt,
      UpdatedAt = @UpdatedAt
  WHERE Id = @Id
`);

export function rescheduleShopwareSyncJob(params: {
  id: number;
  retryCount: number;
  error: string | null;
  nextAttemptAt: string;
  updatedAt: string;
}): void {
  try {
    rescheduleShopwareSyncJobStatement.run({
      Id: params.id,
      RetryCount: params.retryCount,
      LastError: params.error,
      NextAttemptAt: params.nextAttemptAt,
      UpdatedAt: params.updatedAt
    });
  } catch (err) {
    console.error('[db] Failed to reschedule Shopware sync job', { jobId: params.id, error: err });
    throw err;
  }
}

const markShopwareSyncJobFailedStatement = db.prepare(`
  UPDATE shopware_sync_queue
  SET Status = 'failed',
      LastError = @LastError,
      NextAttemptAt = NULL,
      UpdatedAt = @UpdatedAt
  WHERE Id = @Id
`);

export function markShopwareSyncJobFailed(params: { id: number; error: string | null; updatedAt: string }): void {
  try {
    markShopwareSyncJobFailedStatement.run({
      Id: params.id,
      LastError: params.error,
      UpdatedAt: params.updatedAt
    });
  } catch (err) {
    console.error('[db] Failed to mark Shopware sync job failed', { jobId: params.id, error: err });
    throw err;
  }
}

export function getShopwareSyncJobById(id: number): ShopwareSyncQueueEntry | undefined {
  try {
    return getShopwareSyncJobByIdStatement.get(id) as ShopwareSyncQueueEntry | undefined;
  } catch (err) {
    console.error('[db] Failed to load Shopware sync job by id', { jobId: id, error: err });
    throw err;
  }
}

type ItemMutationSnapshot = {
  ItemUUID: string;
  BoxID: string | null;
  Location: string | null;
  Auf_Lager: number | null;
};

const getItemMutationSnapshot = db.prepare(
  `SELECT ItemUUID, BoxID, Location, Auf_Lager FROM items WHERE ItemUUID = ?`
);

const updateItemBoxPlacement = db.prepare(
  `UPDATE items
   SET BoxID = @BoxID,
       Location = @Location,
       UpdatedAt = datetime('now')
   WHERE ItemUUID = @ItemUUID`
);
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
const insertEventStatement = db.prepare(`
  INSERT INTO events (CreatedAt, Actor, EntityType, EntityId, Event, Level, Meta)
  VALUES (datetime('now'), @Actor, @EntityType, @EntityId, @Event, @Level, @Meta)
`);

export type LogEventPayload = {
  Actor?: string | null;
  EntityType: string;
  EntityId: string;
  Event: string;
  Meta?: string | null;
};

export function logEvent(payload: LogEventPayload): void {
  const resolvedLevel = resolveEventLogLevel(payload.Event);
  const entry = {
    Actor: payload.Actor ?? null,
    EntityType: payload.EntityType,
    EntityId: payload.EntityId,
    Event: payload.Event,
    Level: resolvedLevel,
    Meta: payload.Meta ?? null
  };

  try {
    insertEventStatement.run(entry);
  } catch (err) {
    console.warn('[db] Failed to persist event log entry', {
      entityType: entry.EntityType,
      entityId: entry.EntityId,
      event: entry.Event,
      level: entry.Level,
      error: err
    });
  }
}

export type BulkMoveResult = {
  itemId: string;
  fromBoxId: string | null;
  toBoxId: string;
  location: string | null;
};

export type BulkRemoveResult = {
  itemId: string;
  fromBoxId: string | null;
  before: number;
  after: number;
  clearedBox: boolean;
};

export function bulkMoveItems(
  itemIds: string[],
  toBoxId: string,
  actor: string,
  location: string | null
): BulkMoveResult[] {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(itemIds));
  const normalizedLocation = location ?? null;

  const runTxn = db.transaction((ids: string[]): BulkMoveResult[] => {
    const results: BulkMoveResult[] = [];

    for (const itemId of ids) {
      const current = getItemMutationSnapshot.get(itemId) as ItemMutationSnapshot | undefined;
      if (!current) {
        console.warn('[db] bulkMoveItems missing item', { itemId });
        throw new Error(`Item ${itemId} not found`);
      }

      updateItemBoxPlacement.run({ ItemUUID: itemId, BoxID: toBoxId, Location: normalizedLocation });
      logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: itemId,
        Event: 'Moved',
        Meta: JSON.stringify({ from: current.BoxID ?? null, to: toBoxId })
      });

      try {
        const correlationId = generateShopwareCorrelationId('bulkMoveItems', itemId);
        const payload = createShopwareQueuePayload(
          {
            actor,
            fromBoxId: current.BoxID ?? null,
            toBoxId,
            location: normalizedLocation,
            itemUUID: itemId,
            trigger: 'bulk-move-items'
          },
          'bulkMoveItems'
        );
        enqueueShopwareSyncJob({
          CorrelationId: correlationId,
          JobType: 'item-move',
          Payload: payload
        });
      } catch (error) {
        console.error('[db] Failed to enqueue Shopware sync job for bulk move', { itemId, error });
      }

      results.push({
        itemId,
        fromBoxId: current.BoxID ?? null,
        toBoxId,
        location: normalizedLocation
      });
    }

    return results;
  });

  try {
    return runTxn(uniqueIds);
  } catch (err) {
    console.error('[db] bulkMoveItems transaction failed', err);
    throw err;
  }
}

export function bulkRemoveItemStock(itemIds: string[], actor: string): BulkRemoveResult[] {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(itemIds));

  const runTxn = db.transaction((ids: string[]): BulkRemoveResult[] => {
    const results: BulkRemoveResult[] = [];

    for (const itemId of ids) {
      const current = getItemMutationSnapshot.get(itemId) as ItemMutationSnapshot | undefined;
      if (!current) {
        console.warn('[db] bulkRemoveItemStock missing item', { itemId });
        throw new Error(`Item ${itemId} not found`);
      }

      const beforeQty = typeof current.Auf_Lager === 'number' ? current.Auf_Lager : 0;
      if (beforeQty <= 0) {
        console.warn('[db] bulkRemoveItemStock insufficient stock', { itemId, beforeQty });
        throw new Error(`Item ${itemId} has no stock`);
      }

      decrementItemStock.run(itemId);
      const updated = getItemMutationSnapshot.get(itemId) as ItemMutationSnapshot | undefined;
      const afterQty = typeof updated?.Auf_Lager === 'number' ? updated.Auf_Lager : 0;
      const clearedBox = afterQty <= 0;

      logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: itemId,
        Event: 'Removed',
        Meta: JSON.stringify({
          fromBox: current.BoxID ?? null,
          before: beforeQty,
          after: afterQty,
          clearedBox
        })
      });

      try {
        const correlationId = generateShopwareCorrelationId('bulkRemoveItemStock', itemId);
        const payload = createShopwareQueuePayload(
          {
            actor,
            before: beforeQty,
            after: afterQty,
            clearedBox,
            itemUUID: itemId,
            trigger: 'bulk-delete-items'
          },
          'bulkRemoveItemStock'
        );
        enqueueShopwareSyncJob({
          CorrelationId: correlationId,
          JobType: 'stock-decrement',
          Payload: payload
        });
      } catch (error) {
        console.error('[db] Failed to enqueue Shopware sync job for bulk stock removal', {
          itemId,
          error
        });
      }

      results.push({
        itemId,
        fromBoxId: current.BoxID ?? null,
        before: beforeQty,
        after: afterQty,
        clearedBox
      });
    }

    return results;
  });

  try {
    return runTxn(uniqueIds);
  } catch (err) {
    console.error('[db] bulkRemoveItemStock transaction failed', err);
    throw err;
  }
}
export const listEventsForBox = db.prepare(`
  SELECT *
  FROM events
  WHERE EntityType='Box'
    AND EntityId=?
    AND ${levelFilterExpression()}
  ORDER BY Id DESC
  LIMIT 200`);
export const listEventsForItem = db.prepare(`
  SELECT *
  FROM events
  WHERE EntityType='Item'
    AND EntityId=?
    AND ${levelFilterExpression()}
  ORDER BY Id DESC
  LIMIT 200`);
export const listRecentEvents = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Level, e.Meta,
         r.Artikelbeschreibung AS Artikelbeschreibung,
         COALESCE(i.Artikel_Nummer, r.Artikel_Nummer) AS Artikel_Nummer
  FROM events e
  LEFT JOIN items i ON e.EntityType='Item' AND e.EntityId = i.ItemUUID
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
  WHERE ${levelFilterExpression('e')}
  ORDER BY e.Id DESC LIMIT 3`);
export const listRecentActivities = db.prepare(`
  SELECT e.Id, e.CreatedAt, e.Actor, e.EntityType, e.EntityId, e.Event, e.Level, e.Meta,
         r.Artikelbeschreibung AS Artikelbeschreibung,
         COALESCE(i.Artikel_Nummer, r.Artikel_Nummer) AS Artikel_Nummer
  FROM events e
  LEFT JOIN items i ON e.EntityType='Item' AND e.EntityId = i.ItemUUID
  LEFT JOIN item_refs r ON r.Artikel_Nummer = ${ITEM_REFERENCE_JOIN_KEY}
  WHERE ${levelFilterExpression('e')}
  ORDER BY e.CreatedAt DESC
  LIMIT @limit`);
export const countEvents = db.prepare(`SELECT COUNT(*) as c FROM events WHERE ${levelFilterExpression()}`);
export const countBoxes = db.prepare(`SELECT COUNT(*) as c FROM boxes`);
export const countItems = db.prepare(`SELECT COUNT(*) as c FROM items`);
export const countItemsNoBox = db.prepare(`SELECT COUNT(*) as c FROM items WHERE BoxID IS NULL OR BoxID = ''`);
export const listRecentBoxes = db.prepare(
  `SELECT BoxID, Location, StandortLabel, UpdatedAt FROM boxes ORDER BY datetime(UpdatedAt) DESC, BoxID DESC LIMIT 5`
);
export const getMaxBoxId = db.prepare(
  `SELECT BoxID FROM boxes ORDER BY CAST(substr(BoxID, 10) AS INTEGER) DESC LIMIT 1`
);
export const getMaxItemId = db.prepare(
  `SELECT ItemUUID
   FROM items
   WHERE ItemUUID GLOB 'I-[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
   ORDER BY substr(ItemUUID, 3, 6) DESC, CAST(substr(ItemUUID, 10, 4) AS INTEGER) DESC
   LIMIT 1`
);
export const getMaxArtikelNummer = getMaxArtikelNummerStatement;

export const updateAgenticReview = db.prepare(`
  UPDATE agentic_runs
  SET ReviewState = @ReviewState,
      ReviewedBy = @ReviewedBy,
      LastModified = @LastModified,
      LastReviewDecision = @LastReviewDecision,
      LastReviewNotes = @LastReviewNotes,
      Status = COALESCE(@Status, Status)
  WHERE ItemUUID = @ItemUUID
`);

// TODO(agent): Capture metrics on Langtext parsing for list endpoints to guide frontend rollout timing.
const listItemsStatement = db.prepare(`
${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}
${ITEM_JOIN_WITH_BOX}
ORDER BY i.ItemUUID
`);

export const listItems = wrapLangtextAwareStatement(listItemsStatement, 'db:listItems');

const listItemsForExportStatement = db.prepare(`
${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}
${ITEM_JOIN_WITH_BOX}
WHERE (@createdAfter IS NULL OR i.Datum_erfasst >= @createdAfter)
  AND (@updatedAfter IS NULL OR i.UpdatedAt >= @updatedAfter)
ORDER BY i.Datum_erfasst
`);

export const listItemsForExport = wrapLangtextAwareStatement(
  listItemsForExportStatement,
  'db:listItemsForExport'
);

export type {
  AgenticRun,
  Box,
  Item,
  ItemInstance,
  ItemRef,
  LabelJob,
  EventLog
};

export type { ShopwareSyncQueueEntry, ShopwareSyncQueueInsert, ShopwareSyncQueueStatus } from './shopware/queueTypes';

