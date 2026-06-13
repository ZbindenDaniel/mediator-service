import { randomBytes } from 'crypto';
import { query, queryOne, execute, insert, withTransaction, namedQuery, namedQueryOne, namedExecute, getPoolInstance, execBatch } from './db-client';
import { parseLangtext, stringifyLangtext } from './lib/langtext';
import type {
  ShopwareSyncQueueEntry,
  ShopwareSyncQueueInsert,
  ShopwareSyncQueueStatus
} from './shopware/queueTypes';
import {
  AgenticRunReviewHistoryEntry,
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
import { normalizeQuality } from '../models/quality';
import type { QualityAssessment, QualityAssessmentInsert } from '../models/quality';
import type { QualityCheckResponse } from '../models/quality-contract';
import { EVENT_TOPICS, eventKeysForTopics, parseEventTopicAllowList } from '../models/event-labels';
import { parseSequentialItemUUID } from './lib/itemIds';

// ---------------------------------------------------------------------------
// Event log allow-lists (computed at import time from env, no DB needed)
// ---------------------------------------------------------------------------

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
    console.warn('[db] EVENT_LOG_LEVELS contains unknown values; ignoring invalid entries.', { invalid: invalidEventLogLevels });
  }
  if (usedEventLogFallback) {
    console.warn('[db] EVENT_LOG_LEVELS produced no recognized levels; defaulting to all levels.');
  }
}

const computedAllowList = resolvedLevels.length > 0 ? resolvedLevels : [...EVENT_LOG_LEVELS];
if (resolvedLevels.length === 0) {
  console.warn('[db] EVENT_LOG_LEVEL_ALLOW_LIST resolved empty; reverting to full level set.');
}
export const EVENT_LOG_LEVEL_ALLOW_LIST: readonly EventLogLevel[] = Object.freeze([...computedAllowList]);

const rawEventLogTopics = process.env.EVENT_LOG_TOPICS ?? null;
const {
  topics: resolvedEventLogTopics,
  invalid: invalidEventLogTopics,
  hadInput: hadEventLogTopicInput,
  usedFallback: usedEventLogTopicFallback
} = parseEventTopicAllowList(rawEventLogTopics);

if (!hadEventLogTopicInput) {
  console.info('[db] EVENT_LOG_TOPICS not configured; defaulting to all topics.');
} else {
  if (invalidEventLogTopics.length > 0) {
    console.warn('[db] EVENT_LOG_TOPICS contains unknown values; ignoring invalid entries.', { invalid: invalidEventLogTopics });
  }
  if (usedEventLogTopicFallback) {
    console.warn('[db] EVENT_LOG_TOPICS produced no recognized topics; defaulting to all topics.');
  }
}

const computedTopicAllowList = resolvedEventLogTopics.length > 0 ? resolvedEventLogTopics : [...EVENT_TOPICS];
if (resolvedEventLogTopics.length === 0) {
  console.warn('[db] EVENT_LOG_TOPIC_ALLOW_LIST resolved empty; reverting to full topic set.');
}
export const EVENT_LOG_TOPIC_ALLOW_LIST: readonly string[] = Object.freeze([...computedTopicAllowList]);
const EVENT_LOG_TOPIC_EVENT_KEYS: readonly string[] = eventKeysForTopics(EVENT_LOG_TOPIC_ALLOW_LIST);
const EVENT_TOPIC_FILTER_ENABLED =
  EVENT_LOG_TOPIC_ALLOW_LIST.length > 0 &&
  EVENT_LOG_TOPIC_ALLOW_LIST.length < EVENT_TOPICS.length &&
  EVENT_LOG_TOPIC_EVENT_KEYS.length > 0;

if (!EVENT_TOPIC_FILTER_ENABLED && EVENT_LOG_TOPIC_ALLOW_LIST.length < EVENT_TOPICS.length) {
  console.warn('[db] EVENT_LOG_TOPICS filtering disabled because no matching events were found for allowed topics.', {
    configuredTopics: EVENT_LOG_TOPIC_ALLOW_LIST
  });
}

const EVENT_LOG_LEVEL_SQL_LIST = EVENT_LOG_LEVEL_ALLOW_LIST
  .map((level) => `'${level.replace(/'/g, "''")}'`)
  .join(', ');

const EVENT_LOG_TOPIC_SQL_LIST = EVENT_LOG_TOPIC_EVENT_KEYS.map((key) => `'${key.replace(/'/g, "''")}'`).join(', ');

function levelFilterExpression(alias?: string): string {
  if (EVENT_LOG_LEVEL_ALLOW_LIST.length === 0) return '0=1';
  const column = alias ? `${alias}."Level"` : '"Level"';
  return `${column} IN (${EVENT_LOG_LEVEL_SQL_LIST})`;
}

function topicFilterExpression(alias?: string): string {
  if (!EVENT_TOPIC_FILTER_ENABLED) return '1=1';
  if (!EVENT_LOG_TOPIC_SQL_LIST) return '0=1';
  const column = alias ? `${alias}."Event"` : '"Event"';
  return `${column} IN (${EVENT_LOG_TOPIC_SQL_LIST})`;
}

// ---------------------------------------------------------------------------
// Named SQL constants for item_refs and items tables — used by agentic prompt
// builder (backend/agentic/flow/prompts.ts) to extract schema columns.
// ---------------------------------------------------------------------------

// Unquoted column names so that agentic/flow/prompts.ts can parse column identifiers
// without stripping double-quote delimiters from each token.
export const CREATE_ITEM_REFS_SQL = `
CREATE TABLE IF NOT EXISTS item_refs (
  Artikel_Nummer    TEXT PRIMARY KEY,
  Suchbegriff       TEXT,
  Grafikname        TEXT,
  ImageNames        TEXT,
  Artikelbeschreibung TEXT,
  Verkaufspreis     REAL,
  Kurzbeschreibung  TEXT,
  Langtext          TEXT,
  Hersteller        TEXT,
  Länge_mm          INTEGER,
  Breite_mm         INTEGER,
  Höhe_mm           INTEGER,
  Gewicht_kg        REAL,
  Hauptkategorien_A TEXT,
  Unterkategorien_A TEXT,
  Hauptkategorien_B TEXT,
  Unterkategorien_B TEXT,
  Veröffentlicht_Status TEXT,
  Quality           INTEGER DEFAULT NULL,
  Shopartikel       INTEGER,
  Artikeltyp        TEXT,
  Einheit           TEXT,
  EntityType        TEXT,
  EAN               TEXT,
  ShopwareProductId TEXT
);
`;

export const CREATE_ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS items (
  ItemUUID          TEXT PRIMARY KEY,
  Artikel_Nummer    TEXT,
  BoxID             TEXT,
  Location          TEXT,
  UpdatedAt         TEXT NOT NULL,
  Datum_erfasst     TEXT,
  Auf_Lager         INTEGER,
  Quality           INTEGER DEFAULT NULL,
  ShopwareVariantId TEXT,
  SerialNumber      TEXT,
  MacAddress        TEXT,
  QualityId         INTEGER,
  InstanceSpecs     TEXT
);
`;

// ---------------------------------------------------------------------------
// Schema initialization — run once at startup via initDb()
// ---------------------------------------------------------------------------

export async function initDb(): Promise<void> {
  console.info('[db] Initializing Postgres schema');

  await execBatch(`
CREATE TABLE IF NOT EXISTS boxes (
  "BoxID"      TEXT PRIMARY KEY,
  "LocationId" TEXT,
  "Label"      TEXT,
  "CreatedAt"  TEXT,
  "Notes"      TEXT,
  "PhotoPath"  TEXT,
  "PlacedBy"   TEXT,
  "PlacedAt"   TEXT,
  "UpdatedAt"  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS label_queue (
  "Id"        SERIAL PRIMARY KEY,
  "ItemUUID"  TEXT NOT NULL,
  "CreatedAt" TEXT NOT NULL,
  "Status"    TEXT NOT NULL DEFAULT 'Queued',
  "Error"     TEXT
);

CREATE TABLE IF NOT EXISTS events (
  "Id"         SERIAL PRIMARY KEY,
  "CreatedAt"  TEXT NOT NULL,
  "Actor"      TEXT,
  "EntityType" TEXT NOT NULL,
  "EntityId"   TEXT NOT NULL,
  "Event"      TEXT NOT NULL,
  "Level"      TEXT NOT NULL DEFAULT 'Information',
  "Meta"       TEXT
);

CREATE TABLE IF NOT EXISTS shopware_sync_queue (
  "Id"            SERIAL PRIMARY KEY,
  "CorrelationId" TEXT NOT NULL,
  "JobType"       TEXT NOT NULL,
  "Payload"       TEXT NOT NULL,
  "Status"        TEXT NOT NULL DEFAULT 'queued',
  "RetryCount"    INTEGER NOT NULL DEFAULT 0,
  "LastError"     TEXT,
  "LastAttemptAt" TEXT,
  "NextAttemptAt" TEXT,
  "CreatedAt"     TEXT NOT NULL,
  "UpdatedAt"     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_status ON shopware_sync_queue("Status");
CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_status_attempt
  ON shopware_sync_queue ("Status", COALESCE("NextAttemptAt", '1970-01-01'), "Id");
CREATE INDEX IF NOT EXISTS idx_shopware_sync_queue_correlation
  ON shopware_sync_queue ("CorrelationId");

CREATE TABLE IF NOT EXISTS item_refs (
  "Artikel_Nummer"    TEXT PRIMARY KEY,
  "Suchbegriff"       TEXT,
  "Grafikname"        TEXT,
  "ImageNames"        TEXT,
  "Artikelbeschreibung" TEXT,
  "Verkaufspreis"     REAL,
  "Kurzbeschreibung"  TEXT,
  "Langtext"          TEXT,
  "Hersteller"        TEXT,
  "Länge_mm"          INTEGER,
  "Breite_mm"         INTEGER,
  "Höhe_mm"           INTEGER,
  "Gewicht_kg"        REAL,
  "Hauptkategorien_A" TEXT,
  "Unterkategorien_A" TEXT,
  "Hauptkategorien_B" TEXT,
  "Unterkategorien_B" TEXT,
  "Veröffentlicht_Status" TEXT,
  "Quality"           INTEGER DEFAULT NULL,
  "Shopartikel"       INTEGER,
  "Artikeltyp"        TEXT,
  "Einheit"           TEXT,
  "EntityType"        TEXT,
  "EAN"               TEXT,
  "ShopwareProductId" TEXT
);

CREATE TABLE IF NOT EXISTS items (
  "ItemUUID"         TEXT PRIMARY KEY,
  "Artikel_Nummer"   TEXT REFERENCES item_refs("Artikel_Nummer") ON DELETE SET NULL ON UPDATE CASCADE,
  "BoxID"            TEXT REFERENCES boxes("BoxID") ON DELETE SET NULL ON UPDATE CASCADE,
  "Location"         TEXT,
  "UpdatedAt"        TEXT NOT NULL,
  "Datum_erfasst"    TEXT,
  "Auf_Lager"        INTEGER,
  "Quality"          INTEGER DEFAULT NULL,
  "ShopwareVariantId" TEXT,
  "SerialNumber"     TEXT,
  "MacAddress"       TEXT,
  "QualityId"        INTEGER,
  "InstanceSpecs"    TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_mat ON items("Artikel_Nummer");
CREATE INDEX IF NOT EXISTS idx_items_box ON items("BoxID");

CREATE TABLE IF NOT EXISTS quality_assessments (
  "id"               SERIAL PRIMARY KEY,
  "tag"              TEXT NOT NULL CHECK("tag" IN ('Ersatzteil','Upcycling','Ok','Gut','Neuwertig')),
  "value"            INTEGER NOT NULL CHECK("value" BETWEEN 1 AND 5),
  "is_complete"      INTEGER,
  "has_defects"      INTEGER,
  "is_functional"    INTEGER,
  "notes"            TEXT,
  "reviewed_at"      TEXT NOT NULL,
  "reviewed_by"      TEXT NOT NULL,
  "responses"        TEXT,
  "contract_version" TEXT,
  "derived_specs"    TEXT
);

CREATE TABLE IF NOT EXISTS box_stubs (
  "Id"               TEXT PRIMARY KEY,
  "ShelfId"          TEXT NOT NULL REFERENCES boxes("BoxID"),
  "Description"      TEXT NOT NULL,
  "NumberLooseItems" INTEGER NOT NULL DEFAULT 0,
  "NumberLooseBoxes" INTEGER NOT NULL DEFAULT 0,
  "CreatedAt"        TEXT NOT NULL,
  "CreatedBy"        TEXT NOT NULL,
  "IsActive"         INTEGER NOT NULL DEFAULT 1,
  "Notes"            TEXT
);

CREATE INDEX IF NOT EXISTS idx_box_stubs_shelf ON box_stubs("ShelfId");
CREATE INDEX IF NOT EXISTS idx_box_stubs_active ON box_stubs("IsActive") WHERE "IsActive" = 1;

CREATE TABLE IF NOT EXISTS item_ref_relations (
  "Id"                   SERIAL PRIMARY KEY,
  "ParentArtikel_Nummer" TEXT NOT NULL,
  "ChildArtikel_Nummer"  TEXT NOT NULL,
  "RelationType"         TEXT NOT NULL DEFAULT 'Zubehör',
  "Notes"                TEXT,
  "CreatedAt"            TEXT NOT NULL,
  UNIQUE ("ParentArtikel_Nummer", "ChildArtikel_Nummer")
);

CREATE INDEX IF NOT EXISTS idx_item_ref_relations_parent ON item_ref_relations("ParentArtikel_Nummer");
CREATE INDEX IF NOT EXISTS idx_item_ref_relations_child  ON item_ref_relations("ChildArtikel_Nummer");

CREATE TABLE IF NOT EXISTS item_relations (
  "Id"             SERIAL PRIMARY KEY,
  "ParentItemUUID" TEXT NOT NULL,
  "ChildItemUUID"  TEXT NOT NULL,
  "RelationType"   TEXT NOT NULL DEFAULT 'Zubehör',
  "Notes"          TEXT,
  "CreatedAt"      TEXT NOT NULL,
  "UpdatedAt"      TEXT NOT NULL,
  UNIQUE ("ParentItemUUID", "ChildItemUUID")
);

CREATE INDEX IF NOT EXISTS idx_item_relations_parent ON item_relations("ParentItemUUID");
CREATE INDEX IF NOT EXISTS idx_item_relations_child  ON item_relations("ChildItemUUID");

CREATE TABLE IF NOT EXISTS item_attachments (
  "Id"        SERIAL PRIMARY KEY,
  "ItemUUID"  TEXT NOT NULL,
  "FileName"  TEXT NOT NULL,
  "FilePath"  TEXT NOT NULL,
  "MimeType"  TEXT,
  "Label"     TEXT,
  "FileSize"  INTEGER,
  "CreatedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_attachments_item ON item_attachments("ItemUUID");

CREATE TABLE IF NOT EXISTS agentic_runs (
  "Id"                 SERIAL PRIMARY KEY,
  "Artikel_Nummer"     TEXT NOT NULL UNIQUE REFERENCES item_refs("Artikel_Nummer") ON DELETE CASCADE ON UPDATE CASCADE,
  "SearchQuery"        TEXT,
  "LastSearchLinksJson" TEXT,
  "Status"             TEXT NOT NULL,
  "LastModified"       TEXT NOT NULL,
  "ReviewState"        TEXT NOT NULL DEFAULT 'not_required',
  "ReviewedBy"         TEXT,
  "LastReviewDecision" TEXT,
  "LastReviewNotes"    TEXT,
  "RetryCount"         INTEGER NOT NULL DEFAULT 0,
  "NextRetryAt"        TEXT,
  "LastError"          TEXT,
  "LastAttemptAt"      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentic_runs_artikel_nummer ON agentic_runs("Artikel_Nummer");

CREATE TABLE IF NOT EXISTS agentic_request_logs (
  "UUID"                  TEXT PRIMARY KEY,
  "Search"                TEXT,
  "Status"                TEXT,
  "Error"                 TEXT,
  "CreatedAt"             TEXT NOT NULL,
  "UpdatedAt"             TEXT NOT NULL,
  "NotifiedAt"            TEXT,
  "LastNotificationError" TEXT,
  "PayloadJson"           TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentic_request_logs_status ON agentic_request_logs("Status");

CREATE TABLE IF NOT EXISTS agentic_run_review_history (
  "Id"             SERIAL PRIMARY KEY,
  "Artikel_Nummer" TEXT NOT NULL REFERENCES item_refs("Artikel_Nummer") ON DELETE CASCADE ON UPDATE CASCADE,
  "Status"         TEXT NOT NULL,
  "ReviewState"    TEXT NOT NULL,
  "ReviewDecision" TEXT,
  "ReviewNotes"    TEXT,
  "ReviewMetadata" TEXT,
  "ReviewedBy"     TEXT,
  "RecordedAt"     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agentic_run_review_history_artikel_nummer_recorded_at
  ON agentic_run_review_history ("Artikel_Nummer", "RecordedAt", "Id");

CREATE TABLE IF NOT EXISTS user_item_marks (
  "Username"  TEXT NOT NULL,
  "ItemUUID"  TEXT NOT NULL,
  "CreatedAt" TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "Note"      TEXT,
  PRIMARY KEY ("Username", "ItemUUID"),
  FOREIGN KEY ("ItemUUID") REFERENCES items("ItemUUID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_item_marks_username ON user_item_marks("Username");

CREATE TABLE IF NOT EXISTS system_settings (
  "key"   TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS printer_queues (
  name        TEXT PRIMARY KEY,
  device_uri  TEXT NOT NULL DEFAULT '',
  ppd_model   TEXT NOT NULL DEFAULT '',
  media       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

  // Additive column migrations — safe no-ops after first run
  await execBatch(`
ALTER TABLE item_refs ADD COLUMN IF NOT EXISTS "LastSyncedAt" TEXT;
`);

  console.info('[db] Postgres schema ready');
}

// ---------------------------------------------------------------------------
// Close pool (graceful shutdown)
// ---------------------------------------------------------------------------

export async function closeDatabase(options: { reason?: string; suppressErrors?: boolean } = {}): Promise<void> {
  const { reason, suppressErrors = false } = options;
  console.info('[db] Closing database pool', { reason: reason ?? null });
  try {
    await getPoolInstance().end();
    console.info('[db] Database pool closed', { reason: reason ?? null });
  } catch (error) {
    console.error('[db] Failed to close database pool', { reason: reason ?? null, error });
    if (!suppressErrors) throw error;
  }
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
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

function resolveQualityValue(value: unknown, context: string): number | null {
  try {
    const normalized = normalizeQuality(value, console);
    return normalized ?? null;
  } catch (error) {
    console.error('[db] Failed to normalize quality value, leaving unset', { context, error });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Langtext parsing helpers
// ---------------------------------------------------------------------------

function parseLangtextForRow<T extends Record<string, unknown>>(row: T, context: string): T {
  if (!row || typeof row !== 'object') return row;
  const artikelNummer = typeof row['Artikel_Nummer'] === 'string' ? row['Artikel_Nummer'] : null;
  const itemUUID = typeof row['ItemUUID'] === 'string' ? row['ItemUUID'] : null;
  const result = { ...row } as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(row, 'Langtext')) {
    const rawValue = row['Langtext'];
    const parsed = parseLangtext(rawValue, { logger: console, context, artikelNummer, itemUUID });
    result['Langtext'] = parsed ?? (rawValue === undefined ? null : (rawValue as string | null));
  }

  if (Object.prototype.hasOwnProperty.call(row, 'InstanceSpecs')) {
    const rawSpecs = row['InstanceSpecs'];
    if (rawSpecs !== null && rawSpecs !== undefined) {
      const parsed = parseLangtext(rawSpecs, { logger: console, context: `${context}:instanceSpecs`, artikelNummer, itemUUID });
      result['InstanceSpecs'] = parsed ?? null;
    }
  }

  return result as T;
}

function parseLangtextRows<T extends Record<string, unknown>>(rows: T[], context: string): T[] {
  return rows.map((row, i) => parseLangtextForRow(row, `${context}#${i}`));
}

// ---------------------------------------------------------------------------
// Row preparation
// ---------------------------------------------------------------------------

type ItemInstanceRow = {
  ItemUUID: string;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  Location: string | null;
  UpdatedAt: string;
  Datum_erfasst: string | null;
  Auf_Lager: number | null;
  Quality: number | null;
  ShopwareVariantId: string | null;
  SerialNumber: string | null;
  MacAddress: string | null;
};

type ItemRefRow = {
  Artikel_Nummer: string;
  Suchbegriff: string | null;
  Grafikname: string | null;
  ImageNames: string | null;
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
  Quality: number | null;
  Shopartikel: number | null;
  Artikeltyp: string | null;
  Einheit: string | null;
  EntityType: string | null;
  EAN: string | null;
  ShopwareProductId: string | null;
};

function prepareInstanceRow(instance: ItemInstance): ItemInstanceRow {
  const artikelNummer = asNullableTrimmedString(instance.Artikel_Nummer);
  const resolvedQuality = resolveQualityValue((instance as ItemInstance & { Quality?: unknown }).Quality, 'prepareInstanceRow');
  return {
    ItemUUID: instance.ItemUUID,
    Artikel_Nummer: artikelNummer,
    BoxID: instance.BoxID === undefined ? null : instance.BoxID,
    Location: instance.Location === undefined ? null : instance.Location ?? null,
    UpdatedAt: toIsoString(instance.UpdatedAt) || new Date().toISOString(),
    Datum_erfasst: toIsoString(instance.Datum_erfasst),
    Auf_Lager: asNullableInteger(instance.Auf_Lager),
    Quality: resolvedQuality,
    ShopwareVariantId: asNullableTrimmedString((instance as ItemInstance & { ShopwareVariantId?: string | null }).ShopwareVariantId),
    SerialNumber: asNullableTrimmedString(instance.SerialNumber),
    MacAddress: asNullableTrimmedString(instance.MacAddress)
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
  const resolvedQuality = resolveQualityValue((ref as ItemRef & { Quality?: unknown }).Quality, 'prepareRefRow');
  return {
    Artikel_Nummer: artikelNummer,
    Suchbegriff: asNullableTrimmedString((ref as ItemRef & { Suchbegriff?: string | null }).Suchbegriff),
    Grafikname: asNullableString(ref.Grafikname),
    ImageNames: asNullableString(ref.ImageNames),
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
    Quality: resolvedQuality,
    Shopartikel: asNullableInteger(ref.Shopartikel),
    Artikeltyp: asNullableString(ref.Artikeltyp),
    Einheit: asNullableString(ref.Einheit),
    EntityType: asNullableString(ref.EntityType),
    EAN: asNullableString((ref as ItemRef & { EAN?: string | null }).EAN),
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

  if ('__skipReferencePersistence' in directives) delete directives.__skipReferencePersistence;
  if ('__referenceRowOverride' in directives) delete directives.__referenceRowOverride;

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
    console.info('[db] Persisting item reference with ItemUUID fallback key', { itemUUID: instance.ItemUUID });
  }

  try {
    const ref = preparedOverride ?? prepareRefRow({ ...(item as ItemRef), Artikel_Nummer: referenceKey });
    return { instance, ref: skipReferencePersistence ? null : ref };
  } catch (err) {
    console.error('Failed to prepare item reference payload', { itemUUID: instance.ItemUUID, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------

const LOCATION_WITH_BOX_FALLBACK = `COALESCE(NULLIF(i."Location",''), NULLIF(b."Label",''))`;
const ITEM_REFERENCE_JOIN_KEY = `COALESCE(NULLIF(i."Artikel_Nummer",''), i."ItemUUID")`;

const ITEM_JOIN_BASE = `
  FROM items i
  LEFT JOIN item_refs r ON r."Artikel_Nummer" = ${ITEM_REFERENCE_JOIN_KEY}
`;

const ITEM_JOIN_WITH_BOX = `${ITEM_JOIN_BASE}
  LEFT JOIN boxes b ON i."BoxID" = b."BoxID"
  LEFT JOIN boxes shelf ON b."LocationId" = shelf."BoxID"
`;

function itemSelectColumns(locationExpr: string, extraColumns: string[] = []): string {
  const extras = extraColumns.length ? `,\n  ${extraColumns.join(',\n  ')}` : '';
  return `
SELECT
  i."ItemUUID" AS "ItemUUID",
  i."Artikel_Nummer" AS "Artikel_Nummer",
  i."BoxID" AS "BoxID",
  ${locationExpr} AS "Location",
  shelf."Label" AS "ShelfLabel",
  i."UpdatedAt" AS "UpdatedAt",
  i."Datum_erfasst" AS "Datum_erfasst",
  i."Auf_Lager" AS "Auf_Lager",
  CAST(COALESCE(r."Quality", i."Quality") AS INTEGER) AS "Quality",
  i."ShopwareVariantId" AS "ShopwareVariantId",
  i."SerialNumber" AS "SerialNumber",
  i."MacAddress" AS "MacAddress",
  i."InstanceSpecs" AS "InstanceSpecs",
  r."Suchbegriff" AS "Suchbegriff",
  r."Grafikname" AS "Grafikname",
  r."ImageNames" AS "ImageNames",
  r."Artikelbeschreibung" AS "Artikelbeschreibung",
  r."Verkaufspreis" AS "Verkaufspreis",
  r."Kurzbeschreibung" AS "Kurzbeschreibung",
  r."Langtext" AS "Langtext",
  r."Hersteller" AS "Hersteller",
  r."Länge_mm" AS "Länge_mm",
  r."Breite_mm" AS "Breite_mm",
  r."Höhe_mm" AS "Höhe_mm",
  r."Gewicht_kg" AS "Gewicht_kg",
  ROUND(NULLIF(r."Hauptkategorien_A", '')::NUMERIC)::INTEGER AS "Hauptkategorien_A",
  ROUND(NULLIF(r."Unterkategorien_A", '')::NUMERIC)::INTEGER AS "Unterkategorien_A",
  ROUND(NULLIF(r."Hauptkategorien_B", '')::NUMERIC)::INTEGER AS "Hauptkategorien_B",
  ROUND(NULLIF(r."Unterkategorien_B", '')::NUMERIC)::INTEGER AS "Unterkategorien_B",
  r."Veröffentlicht_Status" AS "Veröffentlicht_Status",
  r."Shopartikel" AS "Shopartikel",
  r."Artikeltyp" AS "Artikeltyp",
  r."Einheit" AS "Einheit",
  r."EntityType" AS "EntityType",
  r."EAN" AS "EAN",
  r."ShopwareProductId" AS "ShopwareProductId",
  r."LastSyncedAt" AS "LastSyncedAt",
  CASE
    WHEN EXISTS (SELECT 1 FROM item_relations ir WHERE ir."ChildItemUUID" = i."ItemUUID") THEN 'connected'
    WHEN i."Artikel_Nummer" IS NOT NULL
      AND EXISTS (SELECT 1 FROM item_ref_relations irr WHERE irr."ChildArtikel_Nummer" = i."Artikel_Nummer") THEN 'available'
    ELSE NULL
  END AS "ZubehoerMode"${extras}
`;
}

// ---------------------------------------------------------------------------
// Shopware correlation ID helper
// ---------------------------------------------------------------------------

let shopwareCorrelationCounter = 0;

function normaliseCorrelationSegment(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return fallback;
  const sanitized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return sanitized || fallback;
}

function nextShopwareCorrelationSequence(): string {
  shopwareCorrelationCounter = (shopwareCorrelationCounter + 1) % 1679616;
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

function createShopwareQueuePayload(payload: unknown, context: string): string {
  try {
    return JSON.stringify(payload ?? null);
  } catch (err) {
    console.error('[db] Failed to serialize Shopware queue payload', { context, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Item persistence
// ---------------------------------------------------------------------------

const UPSERT_ITEM_REFERENCE_SQL = `
  INSERT INTO item_refs (
    "Artikel_Nummer", "Suchbegriff", "Grafikname", "ImageNames", "Artikelbeschreibung", "Verkaufspreis", "Kurzbeschreibung",
    "Langtext", "Hersteller", "Länge_mm", "Breite_mm", "Höhe_mm", "Gewicht_kg",
    "Hauptkategorien_A", "Unterkategorien_A", "Hauptkategorien_B", "Unterkategorien_B",
    "Veröffentlicht_Status", "Quality", "Shopartikel", "Artikeltyp", "Einheit", "EntityType", "EAN", "ShopwareProductId"
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
  ON CONFLICT("Artikel_Nummer") DO UPDATE SET
    "Suchbegriff"=EXCLUDED."Suchbegriff",
    "Grafikname"=EXCLUDED."Grafikname",
    "ImageNames"=EXCLUDED."ImageNames",
    "Artikelbeschreibung"=EXCLUDED."Artikelbeschreibung",
    "Verkaufspreis"=EXCLUDED."Verkaufspreis",
    "Kurzbeschreibung"=EXCLUDED."Kurzbeschreibung",
    "Langtext"=EXCLUDED."Langtext",
    "Hersteller"=EXCLUDED."Hersteller",
    "Länge_mm"=EXCLUDED."Länge_mm",
    "Breite_mm"=EXCLUDED."Breite_mm",
    "Höhe_mm"=EXCLUDED."Höhe_mm",
    "Gewicht_kg"=EXCLUDED."Gewicht_kg",
    "Hauptkategorien_A"=EXCLUDED."Hauptkategorien_A",
    "Unterkategorien_A"=EXCLUDED."Unterkategorien_A",
    "Hauptkategorien_B"=EXCLUDED."Hauptkategorien_B",
    "Unterkategorien_B"=EXCLUDED."Unterkategorien_B",
    "Veröffentlicht_Status"=EXCLUDED."Veröffentlicht_Status",
    "Quality"=EXCLUDED."Quality",
    "Shopartikel"=EXCLUDED."Shopartikel",
    "Artikeltyp"=EXCLUDED."Artikeltyp",
    "Einheit"=EXCLUDED."Einheit",
    "EntityType"=EXCLUDED."EntityType",
    "EAN"=EXCLUDED."EAN",
    "ShopwareProductId"=EXCLUDED."ShopwareProductId"
`;

const UPSERT_ITEM_INSTANCE_SQL = `
  INSERT INTO items (
    "ItemUUID","Artikel_Nummer","BoxID","Location","UpdatedAt","Datum_erfasst","Auf_Lager","Quality","ShopwareVariantId","SerialNumber","MacAddress"
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT("ItemUUID") DO UPDATE SET
    "Artikel_Nummer"=EXCLUDED."Artikel_Nummer",
    "BoxID"=EXCLUDED."BoxID",
    "Location"=EXCLUDED."Location",
    "UpdatedAt"=EXCLUDED."UpdatedAt",
    "Datum_erfasst"=EXCLUDED."Datum_erfasst",
    "Auf_Lager"=EXCLUDED."Auf_Lager",
    "Quality"=EXCLUDED."Quality",
    "ShopwareVariantId"=EXCLUDED."ShopwareVariantId",
    "SerialNumber"=EXCLUDED."SerialNumber",
    "MacAddress"=EXCLUDED."MacAddress"
`;

async function upsertItemReferenceRow(row: ItemRefRow): Promise<void> {
  await execute(UPSERT_ITEM_REFERENCE_SQL, [
    row.Artikel_Nummer, row.Suchbegriff, row.Grafikname, row.ImageNames, row.Artikelbeschreibung,
    row.Verkaufspreis, row.Kurzbeschreibung, row.Langtext, row.Hersteller,
    row.Länge_mm, row.Breite_mm, row.Höhe_mm, row.Gewicht_kg,
    row.Hauptkategorien_A, row.Unterkategorien_A, row.Hauptkategorien_B, row.Unterkategorien_B,
    row.Veröffentlicht_Status, row.Quality, row.Shopartikel, row.Artikeltyp,
    row.Einheit, row.EntityType, row.EAN, row.ShopwareProductId
  ]);
}

async function upsertItemInstanceRow(row: ItemInstanceRow): Promise<void> {
  await execute(UPSERT_ITEM_INSTANCE_SQL, [
    row.ItemUUID, row.Artikel_Nummer, row.BoxID, row.Location,
    row.UpdatedAt, row.Datum_erfasst, row.Auf_Lager, row.Quality,
    row.ShopwareVariantId, row.SerialNumber, row.MacAddress
  ]);
}

async function runItemPersistenceStatements(payload: ItemPersistencePayload): Promise<void> {
  if (payload.ref) await upsertItemReferenceRow(payload.ref);
  await upsertItemInstanceRow(payload.instance);
}

export async function persistItemReference(ref: ItemRef): Promise<void> {
  try {
    const row = prepareRefRow(ref);
    await upsertItemReferenceRow(row);
  } catch (err) {
    console.error('Failed to persist item reference', { artikelNummer: ref.Artikel_Nummer, error: err });
    throw err;
  }
}

export async function persistItemInstance(instance: ItemInstance): Promise<void> {
  try {
    const row = prepareInstanceRow(instance);
    await upsertItemInstanceRow(row);
  } catch (err) {
    console.error('Failed to persist item instance', { itemUUID: instance.ItemUUID, error: err });
    throw err;
  }
}

export async function persistItemWithinTransaction(item: Item): Promise<void> {
  const payload = prepareItemPersistencePayload(item);
  try {
    await runItemPersistenceStatements(payload);
  } catch (err) {
    console.error('Failed to persist item within transaction', { itemUUID: item.ItemUUID, error: err });
    throw err;
  }
}

export async function persistItem(item: Item): Promise<void> {
  const payload = prepareItemPersistencePayload(item);
  try {
    await withTransaction(async (client) => {
      await runItemPersistenceStatements(payload);
      try {
        const correlationId = generateShopwareCorrelationId('persistItem', payload.instance.ItemUUID);
        const p = createShopwareQueuePayload(
          { artikelNummer: payload.instance.Artikel_Nummer ?? null, boxId: payload.instance.BoxID ?? null, itemUUID: payload.instance.ItemUUID, trigger: 'persistItem' },
          'persistItem'
        );
        await enqueueShopwareSyncJob({ CorrelationId: correlationId, JobType: 'item-upsert', Payload: p });
      } catch (error) {
        console.error('[db] Failed to enqueue Shopware sync job during persistItem transaction', { itemUUID: payload.instance.ItemUUID, error });
      }
    });
  } catch (err) {
    console.error('Failed to persist item', { itemUUID: item.ItemUUID, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Box operations
// ---------------------------------------------------------------------------

const UPSERT_BOX_SQL = `
  INSERT INTO boxes ("BoxID","LocationId","Label","CreatedAt","Notes","PhotoPath","PlacedBy","PlacedAt","UpdatedAt")
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  ON CONFLICT("BoxID") DO UPDATE SET
    "LocationId"=COALESCE(EXCLUDED."LocationId", boxes."LocationId"),
    "Label"=COALESCE(EXCLUDED."Label", boxes."Label"),
    "CreatedAt"=COALESCE(EXCLUDED."CreatedAt", boxes."CreatedAt"),
    "Notes"=COALESCE(EXCLUDED."Notes", boxes."Notes"),
    "PhotoPath"=COALESCE(EXCLUDED."PhotoPath", boxes."PhotoPath"),
    "PlacedBy"=COALESCE(EXCLUDED."PlacedBy", boxes."PlacedBy"),
    "PlacedAt"=COALESCE(EXCLUDED."PlacedAt", boxes."PlacedAt"),
    "UpdatedAt"=EXCLUDED."UpdatedAt"
`;

// upsertBox kept for backward-compat import shape; callers should use runUpsertBox
export const upsertBox = {
  async run(box: Box): Promise<void> {
    await execute(UPSERT_BOX_SQL, [
      box.BoxID, box.LocationId ?? null, box.Label ?? null, box.CreatedAt ?? null,
      box.Notes ?? null, box.PhotoPath ?? null, box.PlacedBy ?? null, box.PlacedAt ?? null,
      box.UpdatedAt
    ]);
  }
};

export async function runUpsertBox(box: Box, logger: Pick<Console, 'error' | 'warn'> = console): Promise<boolean> {
  try {
    await upsertBox.run(box);
    return true;
  } catch (error) {
    logger.error?.('[db:upsertBox] Failed to upsert box', { error });
    return false;
  }
}

export async function getBox(boxId: string): Promise<Record<string, unknown> | null> {
  const row = await queryOne(`SELECT * FROM boxes WHERE "BoxID" = $1`, [boxId]);
  if (!row) {
    console.warn('[db] getBox returned null', { boxId });
  }
  return row;
}

export async function boxesByLocation(locationId: string): Promise<Record<string, unknown>[]> {
  return query(`SELECT * FROM boxes WHERE "LocationId" = $1 ORDER BY "BoxID"`, [locationId]);
}

export interface ListBoxesHelper {
  all: () => Promise<any[]>;
  byType: (type: string) => Promise<any[]>;
}

const LIST_BOXES_SQL = `
  SELECT b.*, shelf."Label" AS "ShelfLabel",
    COUNT(i."ItemUUID")::int AS "ItemCount",
    COALESCE(SUM(COALESCE(i."Auf_Lager", 0) * COALESCE(r."Gewicht_kg", 0)), 0) AS "TotalWeightKg"
  FROM boxes b
  LEFT JOIN boxes shelf ON b."LocationId" = shelf."BoxID"
  LEFT JOIN items i ON i."BoxID" = b."BoxID"
  LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
  GROUP BY b."BoxID", shelf."Label"
  ORDER BY b."BoxID"
`;

export const listBoxes: ListBoxesHelper = {
  all: async () => query(LIST_BOXES_SQL),
  byType: async (type: string) => {
    const normalized = (type ?? '').toString().trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9]$/.test(normalized)) {
      console.warn('[db:listBoxes] Invalid box type filter', { type });
      return [];
    }
    return query(
      `SELECT b.*, shelf."Label" AS "ShelfLabel",
        COUNT(i."ItemUUID")::int AS "ItemCount",
        COALESCE(SUM(COALESCE(i."Auf_Lager", 0) * COALESCE(r."Gewicht_kg", 0)), 0) AS "TotalWeightKg"
       FROM boxes b
       LEFT JOIN boxes shelf ON b."LocationId" = shelf."BoxID"
       LEFT JOIN items i ON i."BoxID" = b."BoxID"
       LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
       WHERE SUBSTRING(b."BoxID", 1, 1) = $1
       GROUP BY b."BoxID", shelf."Label"
       ORDER BY b."BoxID"`,
      [normalized]
    );
  }
};

// ---------------------------------------------------------------------------
// Item queries
// ---------------------------------------------------------------------------

export async function getItem(uuid: string): Promise<any> {
  const rows = await query(`${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}${ITEM_JOIN_WITH_BOX}WHERE i."ItemUUID" = $1`, [uuid]);
  const row = rows[0] ?? null;
  if (!row) return null;
  return parseLangtextForRow(row as Record<string, unknown>, 'db:getItem');
}

export async function getItemReference(artikelNummer: string): Promise<any> {
  const row = await queryOne(
    `SELECT "Artikel_Nummer","Grafikname","ImageNames","Artikelbeschreibung","Suchbegriff","Verkaufspreis",
            "Kurzbeschreibung","Langtext","Hersteller","Länge_mm","Breite_mm","Höhe_mm","Gewicht_kg",
            "Hauptkategorien_A","Unterkategorien_A","Hauptkategorien_B","Unterkategorien_B",
            "Veröffentlicht_Status","Quality","Shopartikel","Artikeltyp","Einheit","EntityType","ShopwareProductId"
     FROM item_refs WHERE "Artikel_Nummer" = $1`,
    [artikelNummer]
  );
  if (!row) return null;
  return parseLangtextForRow(row as Record<string, unknown>, 'db:getItemReference');
}

export async function findByMaterial(artikelNummer: string): Promise<any[]> {
  const rows = await query(
    `${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK, [
      "COALESCE(ar.\"Status\", 'notStarted') AS \"AgenticStatus\"",
      "COALESCE(ar.\"ReviewState\", 'not_required') AS \"AgenticReviewState\""
    ])}${ITEM_JOIN_WITH_BOX}
     LEFT JOIN agentic_runs ar ON ar."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
     WHERE i."Artikel_Nummer" = $1 AND COALESCE(i."Auf_Lager", 0) > 0
     ORDER BY i."UpdatedAt" DESC`,
    [artikelNummer]
  );
  return parseLangtextRows(rows as Record<string, unknown>[], 'db:findByMaterial');
}

export async function itemsByBox(boxId: string): Promise<any[]> {
  const rows = await query(
    `${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK)}${ITEM_JOIN_WITH_BOX}WHERE i."BoxID" = $1 ORDER BY i."ItemUUID"`,
    [boxId]
  );
  return parseLangtextRows(rows as Record<string, unknown>[], 'db:itemsByBox');
}

export async function getAdjacentItemIds(itemUUID: string): Promise<{ previousId: string | null; nextId: string | null }> {
  const row = await queryOne<{ previousId: string | null; nextId: string | null }>(
    `SELECT
       (SELECT "ItemUUID" FROM items WHERE "ItemUUID" < $1 ORDER BY "ItemUUID" DESC LIMIT 1) AS "previousId",
       (SELECT "ItemUUID" FROM items WHERE "ItemUUID" > $1 ORDER BY "ItemUUID" ASC  LIMIT 1) AS "nextId"`,
    [itemUUID]
  );
  return row ?? { previousId: null, nextId: null };
}

export async function listItems(): Promise<any[]> {
  const rows = await query(
    `${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK, [
      "COALESCE(ar.\"Status\", 'notStarted') AS \"AgenticStatus\"",
      "COALESCE(ar.\"ReviewState\", 'not_required') AS \"AgenticReviewState\""
    ])}${ITEM_JOIN_WITH_BOX}
     LEFT JOIN agentic_runs ar ON ar."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
     WHERE COALESCE(i."Auf_Lager", 0) > 0
     ORDER BY i."ItemUUID"`
  );
  return parseLangtextRows(rows as Record<string, unknown>[], 'db:listItems');
}

export async function listItemsWithFilters(filters: {
  searchTerm: string | null;
  subcategoryFilter: string | null;
  boxFilter: string | null;
  agenticStatus: string | null;
  unplacedOnly: number | null;
}): Promise<any[]> {
  const rows = await query(
    `${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK, [
      "COALESCE(ar.\"Status\", 'notStarted') AS \"AgenticStatus\"",
      "COALESCE(ar.\"ReviewState\", 'not_required') AS \"AgenticReviewState\""
    ])}${ITEM_JOIN_WITH_BOX}
     LEFT JOIN agentic_runs ar ON ar."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
     WHERE COALESCE(i."Auf_Lager", 0) > 0
     AND ($1::TEXT IS NULL OR $1 = '' OR LOWER(COALESCE(r."Artikelbeschreibung",'')) LIKE $1
          OR LOWER(COALESCE(i."Artikel_Nummer",'')) LIKE $1 OR LOWER(COALESCE(i."ItemUUID",'')) LIKE $1)
     AND ($2::TEXT IS NULL OR $2 = '' OR LOWER(COALESCE(CAST(r."Unterkategorien_A" AS TEXT),'')) LIKE $2)
     AND ($3::TEXT IS NULL OR $3 = '' OR LOWER(COALESCE(i."BoxID",'')) LIKE $3)
     AND ($4::TEXT IS NULL OR $4 = '' OR COALESCE(ar."Status",'notStarted') = $4)
     AND ($5::INTEGER IS NULL OR $5 = 0 OR i."BoxID" IS NULL)
     ORDER BY i."ItemUUID"`,
    [filters.searchTerm, filters.subcategoryFilter, filters.boxFilter, filters.agenticStatus, filters.unplacedOnly]
  );
  return parseLangtextRows(rows as Record<string, unknown>[], 'db:listItemsWithFilters');
}

export async function listItemReferencesWithFilters(filters: {
  searchTerm: string | null;
  subcategoryFilter: string | null;
  boxFilter: string | null;
  agenticStatus: string | null;
  unplacedOnly: number | null;
}): Promise<any[]> {
  const rows = await query(
    `SELECT
      COALESCE(NULLIF(i."ItemUUID",''), r."Artikel_Nummer") AS "ItemUUID",
      COALESCE(NULLIF(r."Artikel_Nummer",''), i."ItemUUID") AS "Artikel_Nummer",
      i."BoxID",${LOCATION_WITH_BOX_FALLBACK} AS "Location",shelf."Label" AS "ShelfLabel",
      i."UpdatedAt",i."Datum_erfasst",i."Auf_Lager",i."ShopwareVariantId",
      r."Grafikname",r."ImageNames",r."Artikelbeschreibung",r."Verkaufspreis",r."Kurzbeschreibung",
      r."Langtext",r."Hersteller",r."Länge_mm",r."Breite_mm",r."Höhe_mm",r."Gewicht_kg",
      ROUND(NULLIF(r."Hauptkategorien_A", '')::NUMERIC)::INTEGER AS "Hauptkategorien_A",
      ROUND(NULLIF(r."Unterkategorien_A", '')::NUMERIC)::INTEGER AS "Unterkategorien_A",
      ROUND(NULLIF(r."Hauptkategorien_B", '')::NUMERIC)::INTEGER AS "Hauptkategorien_B",
      ROUND(NULLIF(r."Unterkategorien_B", '')::NUMERIC)::INTEGER AS "Unterkategorien_B",
      r."Veröffentlicht_Status",r."Shopartikel",r."Artikeltyp",r."Einheit",r."EntityType",r."EAN",r."ShopwareProductId",
      COALESCE(ar."Status",'notStarted') AS "AgenticStatus",
      COALESCE(ar."ReviewState",'not_required') AS "AgenticReviewState"
     FROM item_refs r
     LEFT JOIN items i ON i."Artikel_Nummer" = r."Artikel_Nummer"
     LEFT JOIN boxes b ON i."BoxID" = b."BoxID"
     LEFT JOIN boxes shelf ON b."LocationId" = shelf."BoxID"
     LEFT JOIN agentic_runs ar ON ar."Artikel_Nummer" = COALESCE(NULLIF(i."Artikel_Nummer",''), NULLIF(r."Artikel_Nummer",''))
     WHERE (i."ItemUUID" IS NULL OR i."ItemUUID" = '')
     AND ($1::TEXT IS NULL OR $1 = '' OR LOWER(COALESCE(r."Artikelbeschreibung",'')) LIKE $1
          OR LOWER(COALESCE(r."Artikel_Nummer",'')) LIKE $1 OR LOWER(COALESCE(i."ItemUUID",'')) LIKE $1)
     AND ($2::TEXT IS NULL OR $2 = '' OR LOWER(COALESCE(CAST(r."Unterkategorien_A" AS TEXT),'')) LIKE $2)
     AND ($3::TEXT IS NULL OR $3 = '' OR LOWER(COALESCE(i."BoxID",'')) LIKE $3)
     AND ($4::TEXT IS NULL OR $4 = '' OR COALESCE(ar."Status",'notStarted') = $4)
     AND ($5::INTEGER IS NULL OR $5 = 0 OR i."BoxID" IS NULL)
     ORDER BY COALESCE(NULLIF(r."Artikel_Nummer",''), i."ItemUUID")`,
    [filters.searchTerm, filters.subcategoryFilter, filters.boxFilter, filters.agenticStatus, filters.unplacedOnly]
  );
  return parseLangtextRows(rows as Record<string, unknown>[], 'db:listItemReferencesWithFilters');
}

export async function listItemReferences(): Promise<any[]> {
  return query(
    `SELECT r."Artikel_Nummer", i."ItemUUID" AS "InstanceItemUUID"
     FROM item_refs r
     LEFT JOIN items i ON i."Artikel_Nummer" = r."Artikel_Nummer"
     ORDER BY COALESCE(NULLIF(r."Artikel_Nummer",''), i."ItemUUID")`
  );
}

export interface ListItemsForExportFilters {
  createdAfter: string | null;
  updatedAfter: string | null;
  itemIds?: string[] | null;
}

function normalizeItemIdFilters(rawItemIds: unknown): string[] {
  if (!Array.isArray(rawItemIds)) return [];
  const normalized: string[] = [];
  for (const candidate of rawItemIds) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed && !normalized.includes(trimmed)) normalized.push(trimmed);
  }
  return normalized;
}

export const listItemsForExport = {
  async all(filters: Partial<ListItemsForExportFilters>): Promise<any[]> {
    const createdAfter = filters?.createdAfter ?? null;
    const updatedAfter = filters?.updatedAfter ?? null;
    const itemIds = normalizeItemIdFilters(filters?.itemIds);

    let sql = `${itemSelectColumns(LOCATION_WITH_BOX_FALLBACK, [
      "COALESCE(ar.\"Status\", 'notStarted') AS \"AgenticStatus\"",
      "COALESCE(ar.\"ReviewState\", 'not_required') AS \"AgenticReviewState\""
    ])}${ITEM_JOIN_WITH_BOX}
     LEFT JOIN agentic_runs ar ON ar."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
     WHERE ($1::TEXT IS NULL OR i."Datum_erfasst" >= $1)
       AND ($2::TEXT IS NULL OR i."UpdatedAt" >= $2)`;

    const params: unknown[] = [createdAfter, updatedAfter];

    if (itemIds.length > 0) {
      const placeholders = itemIds.map((_, idx) => `$${idx + 3}`).join(', ');
      sql += ` AND i."ItemUUID" IN (${placeholders})`;
      params.push(...itemIds);
    }

    sql += ` ORDER BY COALESCE(NULLIF(i."Artikel_Nummer",''), i."ItemUUID"), i."ItemUUID"`;
    const rows = await query(sql, params);
    return parseLangtextRows(rows as Record<string, unknown>[], 'db:listItemsForExport');
  }
};

// ---------------------------------------------------------------------------
// Item mutations
// ---------------------------------------------------------------------------

export async function decrementItemStock(itemUUID: string): Promise<number> {
  return execute(
    `UPDATE items SET "Auf_Lager"="Auf_Lager"-1,
       "BoxID"=CASE WHEN "Auf_Lager"-1<=0 THEN NULL ELSE "BoxID" END,
       "Location"=CASE WHEN "Auf_Lager"-1<=0 THEN NULL ELSE "Location" END,
       "UpdatedAt"=$2
     WHERE "ItemUUID"=$1 AND "Auf_Lager">0`,
    [itemUUID, new Date().toISOString()]
  );
}

export async function incrementItemStock(itemUUID: string): Promise<number> {
  return execute(
    `UPDATE items SET "Auf_Lager"="Auf_Lager"+1, "UpdatedAt"=$2 WHERE "ItemUUID"=$1`,
    [itemUUID, new Date().toISOString()]
  );
}

export async function zeroItemStock(itemUUID: string): Promise<number> {
  return execute(
    `UPDATE items SET "Auf_Lager"=0,"BoxID"=NULL,"Location"=NULL,"UpdatedAt"=$2 WHERE "ItemUUID"=$1`,
    [itemUUID, new Date().toISOString()]
  );
}

export async function deleteItem(itemUUID: string): Promise<number> {
  return execute(`DELETE FROM items WHERE "ItemUUID"=$1`, [itemUUID]);
}

export async function deleteBox(boxId: string): Promise<number> {
  return execute(`DELETE FROM boxes WHERE "BoxID"=$1`, [boxId]);
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export type BulkMoveResult = { itemId: string; fromBoxId: string | null; toBoxId: string; location: string | null };
export type BulkRemoveResult = { itemId: string; fromBoxId: string | null; before: number; after: number; clearedBox: boolean };

export async function bulkMoveItems(itemIds: string[], toBoxId: string, actor: string, location: string | null): Promise<BulkMoveResult[]> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(itemIds));
  const normalizedLocation = location ?? null;

  return withTransaction(async () => {
    const results: BulkMoveResult[] = [];
    const now = new Date().toISOString();

    for (const itemId of uniqueIds) {
      const current = await queryOne<{ ItemUUID: string; BoxID: string | null; Location: string | null; Auf_Lager: number | null }>(
        `SELECT "ItemUUID","BoxID","Location","Auf_Lager" FROM items WHERE "ItemUUID"=$1`, [itemId]
      );
      if (!current) {
        console.warn('[db] bulkMoveItems missing item', { itemId });
        throw new Error(`Item ${itemId} not found`);
      }

      await execute(
        `UPDATE items SET "BoxID"=$2,"Location"=$3,"UpdatedAt"=$4 WHERE "ItemUUID"=$1`,
        [itemId, toBoxId, normalizedLocation, now]
      );

      await logEvent({ Actor: actor, EntityType: 'Item', EntityId: itemId, Event: 'Moved', Meta: JSON.stringify({ from: current.BoxID ?? null, to: toBoxId }) });

      try {
        const correlationId = generateShopwareCorrelationId('bulkMoveItems', itemId);
        const p = createShopwareQueuePayload({ actor, fromBoxId: current.BoxID ?? null, toBoxId, location: normalizedLocation, itemUUID: itemId, trigger: 'bulk-move-items' }, 'bulkMoveItems');
        await enqueueShopwareSyncJob({ CorrelationId: correlationId, JobType: 'item-move', Payload: p });
      } catch (error) {
        console.error('[db] Failed to enqueue Shopware sync job for bulk move', { itemId, error });
      }

      results.push({ itemId, fromBoxId: current.BoxID ?? null, toBoxId, location: normalizedLocation });
    }
    return results;
  });
}

export async function bulkRemoveItemStock(itemIds: string[], actor: string): Promise<BulkRemoveResult[]> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(itemIds));

  return withTransaction(async () => {
    const results: BulkRemoveResult[] = [];
    const now = new Date().toISOString();

    for (const itemId of uniqueIds) {
      const current = await queryOne<{ ItemUUID: string; BoxID: string | null; Location: string | null; Auf_Lager: number | null }>(
        `SELECT "ItemUUID","BoxID","Location","Auf_Lager" FROM items WHERE "ItemUUID"=$1`, [itemId]
      );
      if (!current) throw new Error(`Item ${itemId} not found`);

      const beforeQty = typeof current.Auf_Lager === 'number' ? current.Auf_Lager : 0;
      if (beforeQty <= 0) throw new Error(`Item ${itemId} has no stock`);

      await decrementItemStock(itemId);

      const updated = await queryOne<{ Auf_Lager: number | null; BoxID: string | null }>(
        `SELECT "Auf_Lager","BoxID" FROM items WHERE "ItemUUID"=$1`, [itemId]
      );
      const afterQty = typeof updated?.Auf_Lager === 'number' ? updated.Auf_Lager : 0;
      const clearedBox = afterQty <= 0;

      await logEvent({ Actor: actor, EntityType: 'Item', EntityId: itemId, Event: 'Removed', Meta: JSON.stringify({ fromBox: current.BoxID ?? null, before: beforeQty, after: afterQty, clearedBox }) });

      try {
        const correlationId = generateShopwareCorrelationId('bulkRemoveItemStock', itemId);
        const p = createShopwareQueuePayload({ actor, before: beforeQty, after: afterQty, clearedBox, itemUUID: itemId, trigger: 'bulk-delete-items' }, 'bulkRemoveItemStock');
        await enqueueShopwareSyncJob({ CorrelationId: correlationId, JobType: 'stock-decrement', Payload: p });
      } catch (error) {
        console.error('[db] Failed to enqueue Shopware sync job for bulk stock removal', { itemId, error });
      }

      results.push({ itemId, fromBoxId: current.BoxID ?? null, before: beforeQty, after: afterQty, clearedBox });
    }
    return results;
  });
}

export type BulkUpdateShopFieldsGroup = { artikelNummer: string; itemIds: string[] };

export async function bulkUpdateItemRefShopFields(
  groups: BulkUpdateShopFieldsGroup[],
  shopartikel: number | null,
  veröffentlichtStatus: string | null,
  verkaufspreis: number | null,
  actor: string
): Promise<string[]> {
  if (!Array.isArray(groups) || groups.length === 0) return [];

  return withTransaction(async () => {
    const updated: string[] = [];
    for (const group of groups) {
      const { artikelNummer, itemIds } = group;
      await execute(
        `UPDATE item_refs SET
           "Verkaufspreis"=COALESCE($2,"Verkaufspreis"),
           "Shopartikel"=COALESCE($3,"Shopartikel"),
           "Veröffentlicht_Status"=COALESCE($4,"Veröffentlicht_Status")
         WHERE "Artikel_Nummer"=$1`,
        [artikelNummer, verkaufspreis, shopartikel, veröffentlichtStatus]
      );
      await logEvent({ Actor: actor, EntityType: 'Item', EntityId: artikelNummer, Event: 'ShopStatusUpdated', Meta: JSON.stringify({ shopartikel, veröffentlichtStatus, verkaufspreis }) });

      for (const itemId of itemIds) {
        try {
          const correlationId = generateShopwareCorrelationId('bulkUpdateShopStatus', itemId);
          const p = createShopwareQueuePayload({ artikelNummer, itemUUID: itemId, trigger: 'bulk-update-shop-status', actor }, 'bulkUpdateShopStatus');
          await enqueueShopwareSyncJob({ CorrelationId: correlationId, JobType: 'item-upsert', Payload: p });
        } catch (error) {
          console.error('[db] Failed to enqueue Shopware sync job for bulk shop status update', { itemId, error });
        }
      }
      updated.push(artikelNummer);
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Item UUID resolution
// ---------------------------------------------------------------------------

export interface CanonicalItemUUIDResolution {
  itemUUID: string | null;
  usedFallback: boolean;
}

export async function resolveCanonicalItemUUIDForArtikelnummer(
  artikelNummer: string | null | undefined,
  options: {
    logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  } = {}
): Promise<CanonicalItemUUIDResolution> {
  const logger = options.logger ?? console;
  const normalizedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!normalizedArtikelNummer) {
    logger.warn?.('[db] Unable to resolve canonical ItemUUID without Artikelnummer', { artikelNummer: artikelNummer ?? null });
    return { itemUUID: null, usedFallback: false };
  }

  let instances: Array<{ ItemUUID?: string | null }> = [];
  try {
    instances = await findByMaterial(normalizedArtikelNummer);
  } catch (err) {
    logger.error?.('[db] Failed to load instances for canonical ItemUUID resolution', { artikelNummer: normalizedArtikelNummer, error: err });
    return { itemUUID: null, usedFallback: false };
  }

  const canonical = instances.find((instance) => {
    const candidate = typeof instance?.ItemUUID === 'string' ? instance.ItemUUID.trim() : '';
    if (!candidate) return false;
    const parsed = parseSequentialItemUUID(candidate);
    return parsed?.kind === 'artikelnummer' && parsed.artikelNummer === normalizedArtikelNummer && parsed.sequence === 1;
  });

  if (canonical?.ItemUUID) return { itemUUID: canonical.ItemUUID, usedFallback: false };

  const fallback = instances.find((instance) => typeof instance?.ItemUUID === 'string' && instance.ItemUUID.trim());
  if (fallback?.ItemUUID) {
    logger.info?.('[db] Falling back to non-canonical ItemUUID for reference', { artikelNummer: normalizedArtikelNummer, fallbackItemUUID: fallback.ItemUUID });
    return { itemUUID: fallback.ItemUUID, usedFallback: true };
  }

  logger.warn?.('[db] Failed to resolve any ItemUUID for reference', { artikelNummer: normalizedArtikelNummer });
  return { itemUUID: null, usedFallback: false };
}

// ---------------------------------------------------------------------------
// ID generation queries
// ---------------------------------------------------------------------------

export async function getMaxShelfIndex(prefix: string): Promise<number | null> {
  const row = await queryOne<{ MaxIndex: string | null }>(
    `SELECT MAX(CAST(SUBSTRING("BoxID", LENGTH($1) + 1) AS INTEGER)) AS "MaxIndex"
     FROM boxes WHERE "BoxID" LIKE $2`,
    [prefix, `${prefix}%`]
  );
  return row?.MaxIndex != null ? Number(row.MaxIndex) : null;
}

export async function getMaxBoxId(): Promise<string | null> {
  const row = await queryOne<{ BoxID: string }>(
    `SELECT "BoxID" FROM boxes
     WHERE "BoxID" SIMILAR TO 'B-[0-9A-Za-z]{6}-[0-9A-Za-z]{4}'
     ORDER BY CAST(SUBSTRING("BoxID", 10) AS INTEGER) DESC
     LIMIT 1`
  );
  return row?.BoxID ?? null;
}

export async function getMaxItemId(pattern: string, sequenceStartIndex: number): Promise<string | null> {
  const row = await queryOne<{ ItemUUID: string }>(
    `SELECT "ItemUUID" FROM items
     WHERE "ItemUUID" LIKE $1
     ORDER BY CAST(SUBSTRING("ItemUUID", $2, 4) AS INTEGER) DESC
     LIMIT 1`,
    [pattern, sequenceStartIndex]
  );
  return row?.ItemUUID ?? null;
}

export async function getMaxArtikelNummer(): Promise<string | null> {
  const row = await queryOne<{ Artikel_Nummer: string }>(
    `SELECT "Artikel_Nummer" FROM item_refs
     WHERE "Artikel_Nummer" IS NOT NULL AND "Artikel_Nummer" != ''
     ORDER BY CAST("Artikel_Nummer" AS INTEGER) DESC
     LIMIT 1`
  );
  return row?.Artikel_Nummer ?? null;
}

export async function hasItemReferenceByArtikelNummer(artikelNummer: string): Promise<boolean> {
  const normalizedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!normalizedArtikelNummer) return false;
  try {
    const row = await queryOne<{ ExistsFlag: number }>(
      `SELECT 1 AS "ExistsFlag" FROM item_refs WHERE "Artikel_Nummer"=$1 LIMIT 1`,
      [normalizedArtikelNummer]
    );
    return Boolean(row?.ExistsFlag);
  } catch (err) {
    console.error('[db] Failed to check item_refs parent for Artikel_Nummer', { artikelNummer: normalizedArtikelNummer, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Label queue
// ---------------------------------------------------------------------------

export async function queueLabel(itemUUID: string): Promise<void> {
  await execute(
    `INSERT INTO label_queue ("ItemUUID","CreatedAt") VALUES ($1,$2)`,
    [itemUUID, new Date().toISOString()]
  );
}

export async function nextLabelJob(): Promise<LabelJob | null> {
  return queryOne<LabelJob>(`SELECT * FROM label_queue WHERE "Status"='Queued' ORDER BY "Id" LIMIT 1`);
}

export async function updateLabelJobStatus(id: number, status: string, error: string | null): Promise<void> {
  await execute(`UPDATE label_queue SET "Status"=$2,"Error"=$3 WHERE "Id"=$1`, [id, status, error]);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type LogEventPayload = {
  Actor?: string | null;
  EntityType: string;
  EntityId: string;
  Event: string;
  Meta?: string | null;
};

export type EventLogInsertPayload = {
  CreatedAt: string;
  Actor?: string | null;
  EntityType: string;
  EntityId: string;
  Event: string;
  Level: EventLogLevel;
  Meta?: string | null;
};

export async function logEvent(payload: LogEventPayload): Promise<void> {
  const resolvedLevel = resolveEventLogLevel(payload.Event);
  try {
    await execute(
      `INSERT INTO events ("CreatedAt","Actor","EntityType","EntityId","Event","Level","Meta")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [new Date().toISOString(), payload.Actor ?? null, payload.EntityType, payload.EntityId, payload.Event, resolvedLevel, payload.Meta ?? null]
    );
  } catch (err) {
    console.warn('[db] Failed to persist event log entry', { entityType: payload.EntityType, entityId: payload.EntityId, event: payload.Event, error: err });
  }
}

export async function insertEventLogEntry(payload: EventLogInsertPayload): Promise<boolean> {
  try {
    await execute(
      `INSERT INTO events ("CreatedAt","Actor","EntityType","EntityId","Event","Level","Meta")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [payload.CreatedAt, payload.Actor ?? null, payload.EntityType, payload.EntityId, payload.Event, payload.Level, payload.Meta ?? null]
    );
    return true;
  } catch (err) {
    console.error('[db] Failed to import event log entry', { entityType: payload.EntityType, entityId: payload.EntityId, error: err });
    return false;
  }
}

export async function listEventsForBox(boxId: string): Promise<EventLog[]> {
  return query<EventLog>(
    `SELECT * FROM events WHERE "EntityType"='Box' AND "EntityId"=$1
     AND ${levelFilterExpression()} AND ${topicFilterExpression()}
     ORDER BY "Id" DESC LIMIT 200`,
    [boxId]
  );
}

export async function listEventsForItem(itemId: string): Promise<EventLog[]> {
  return query<EventLog>(
    `SELECT * FROM events WHERE "EntityType"='Item' AND "EntityId"=$1
     AND ${levelFilterExpression()} AND ${topicFilterExpression()}
     ORDER BY "Id" DESC LIMIT 200`,
    [itemId]
  );
}

export async function listRecentEvents(): Promise<any[]> {
  return query(
    `SELECT e."Id",e."CreatedAt",e."Actor",e."EntityType",e."EntityId",e."Event",e."Level",e."Meta",
            r."Artikelbeschreibung",COALESCE(i."Artikel_Nummer",r."Artikel_Nummer") AS "Artikel_Nummer"
     FROM events e
     LEFT JOIN items i ON e."EntityType"='Item' AND e."EntityId"=i."ItemUUID"
     LEFT JOIN item_refs r ON r."Artikel_Nummer"=${ITEM_REFERENCE_JOIN_KEY}
     WHERE ${levelFilterExpression('e')} AND ${topicFilterExpression('e')}
     ORDER BY e."Id" DESC LIMIT 3`
  );
}

export async function listRecentActivities(limit: number): Promise<any[]> {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  return query(
    `SELECT e."Id",e."CreatedAt",e."Actor",e."EntityType",e."EntityId",e."Event",e."Level",e."Meta",
            r."Artikelbeschreibung",COALESCE(i."Artikel_Nummer",r."Artikel_Nummer") AS "Artikel_Nummer"
     FROM events e
     LEFT JOIN items i ON e."EntityType"='Item' AND e."EntityId"=i."ItemUUID"
     LEFT JOIN item_refs r ON r."Artikel_Nummer"=${ITEM_REFERENCE_JOIN_KEY}
     WHERE ${levelFilterExpression('e')} AND ${topicFilterExpression('e')}
     ORDER BY e."CreatedAt" DESC LIMIT $1`,
    [effectiveLimit]
  );
}

export async function listRecentActivitiesByTerm(term: string, limit: number): Promise<any[]> {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  return query(
    `SELECT e."Id",e."CreatedAt",e."Actor",e."EntityType",e."EntityId",e."Event",e."Level",e."Meta",
            r."Artikelbeschreibung",COALESCE(i."Artikel_Nummer",r."Artikel_Nummer") AS "Artikel_Nummer"
     FROM events e
     LEFT JOIN items i ON e."EntityType"='Item' AND e."EntityId"=i."ItemUUID"
     LEFT JOIN item_refs r ON r."Artikel_Nummer"=${ITEM_REFERENCE_JOIN_KEY}
     WHERE ${levelFilterExpression('e')} AND ${topicFilterExpression('e')}
     AND (e."EntityId" LIKE $1 OR COALESCE(i."Artikel_Nummer",r."Artikel_Nummer") LIKE $1 OR i."BoxID" LIKE $1)
     ORDER BY e."CreatedAt" DESC LIMIT $2`,
    [term, effectiveLimit]
  );
}

export async function countEvents(): Promise<number> {
  const row = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM events WHERE ${levelFilterExpression()} AND ${topicFilterExpression()}`);
  return Number(row?.c ?? 0);
}

export async function countBoxes(): Promise<number> {
  const row = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM boxes`);
  return Number(row?.c ?? 0);
}

export async function countItems(): Promise<number> {
  const row = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM items`);
  return Number(row?.c ?? 0);
}

export async function countItemsNoBox(): Promise<number> {
  const row = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM items WHERE "BoxID" IS NULL OR "BoxID"=''`);
  return Number(row?.c ?? 0);
}

export async function listItemsForCo2(): Promise<any[]> {
  return query(
    `SELECT r."Unterkategorien_A", i."Datum_erfasst", i."Quality"
     FROM items i LEFT JOIN item_refs r ON r."Artikel_Nummer"=i."Artikel_Nummer"
     WHERE r."Unterkategorien_A" IS NOT NULL`
  );
}

export async function countAgenticRunsByStatus(): Promise<Array<{ status: string; c: string }>> {
  return query(
    `SELECT COALESCE(NULLIF(TRIM("Status"),''),'notStarted') AS status, COUNT(*) as c
     FROM agentic_runs GROUP BY COALESCE(NULLIF(TRIM("Status"),''),'notStarted')`
  );
}

export async function countEnrichedItemReferences(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    `SELECT COUNT(*) as c FROM item_refs WHERE "Langtext" IS NOT NULL AND TRIM("Langtext")!=''`
  );
  return Number(row?.c ?? 0);
}

export async function sumInventoryWeightKg(): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(COALESCE(i."Auf_Lager",0)*COALESCE(r."Gewicht_kg",0)),0) AS total
     FROM items i LEFT JOIN item_refs r ON i."Artikel_Nummer"=r."Artikel_Nummer"`
  );
  return Number(row?.total ?? 0);
}

export async function sumInventoryPriceValue(): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(COALESCE(i."Auf_Lager",0)*COALESCE(r."Verkaufspreis",0)),0) AS total
     FROM items i LEFT JOIN item_refs r ON i."Artikel_Nummer"=r."Artikel_Nummer"
     WHERE r."Verkaufspreis" IS NOT NULL AND r."Verkaufspreis" > 0`
  );
  return Number(row?.total ?? 0);
}

// Returns Artikel_Nummern of shop refs that have been synced before and have changed since.
// Refs where LastSyncedAt IS NULL are excluded — they require a manual first sync to enter the cycle.
export async function listRefsChangedSinceSync(): Promise<string[]> {
  const rows = await query<{ Artikel_Nummer: string }>(
    `SELECT DISTINCT r."Artikel_Nummer"
     FROM item_refs r
     JOIN items i ON i."Artikel_Nummer" = r."Artikel_Nummer"
     WHERE r."Shopartikel" = 1
       AND r."LastSyncedAt" IS NOT NULL
       AND i."UpdatedAt" > r."LastSyncedAt"`
  );
  return rows.map((r) => r.Artikel_Nummer);
}

export async function markRefsSynced(artikelNummern: string[]): Promise<void> {
  if (artikelNummern.length === 0) return;
  const placeholders = artikelNummern.map((_, i) => `$${i + 1}`).join(', ');
  await execute(
    `UPDATE item_refs SET "LastSyncedAt"=NOW()::TEXT WHERE "Artikel_Nummer" IN (${placeholders})`,
    artikelNummern
  );
}

export async function getSystemSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    `SELECT "value" FROM system_settings WHERE "key"=$1`, [key]
  );
  return row?.value ?? null;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO system_settings ("key","value") VALUES ($1,$2)
     ON CONFLICT ("key") DO UPDATE SET "value"=$2`,
    [key, value]
  );
}

export async function listRecentBoxes(): Promise<any[]> {
  return query(
    `SELECT "BoxID","LocationId","Label","UpdatedAt" FROM boxes ORDER BY "UpdatedAt" DESC, "BoxID" DESC LIMIT 5`
  );
}

// ---------------------------------------------------------------------------
// Agentic runs
// ---------------------------------------------------------------------------

export async function upsertAgenticRun(params: {
  Artikel_Nummer: string;
  SearchQuery?: string | null;
  LastSearchLinksJson?: string | null;
  Status: string;
  LastModified: string;
  ReviewState: string;
  ReviewedBy?: string | null;
  LastReviewDecision?: string | null;
  LastReviewNotes?: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO agentic_runs ("Artikel_Nummer","SearchQuery","LastSearchLinksJson","Status","LastModified","ReviewState","ReviewedBy","LastReviewDecision","LastReviewNotes")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT("Artikel_Nummer") DO UPDATE SET
       "SearchQuery"=COALESCE(EXCLUDED."SearchQuery",agentic_runs."SearchQuery"),
       "LastSearchLinksJson"=COALESCE(EXCLUDED."LastSearchLinksJson",agentic_runs."LastSearchLinksJson"),
       "Status"=EXCLUDED."Status",
       "LastModified"=EXCLUDED."LastModified",
       "ReviewState"=EXCLUDED."ReviewState",
       "ReviewedBy"=EXCLUDED."ReviewedBy",
       "LastReviewDecision"=COALESCE(EXCLUDED."LastReviewDecision",agentic_runs."LastReviewDecision"),
       "LastReviewNotes"=COALESCE(EXCLUDED."LastReviewNotes",agentic_runs."LastReviewNotes"),
       "RetryCount"=CASE WHEN EXCLUDED."Status"='queued' THEN 0 ELSE agentic_runs."RetryCount" END,
       "NextRetryAt"=CASE WHEN EXCLUDED."Status"='queued' THEN NULL ELSE agentic_runs."NextRetryAt" END,
       "LastError"=CASE WHEN EXCLUDED."Status"='queued' THEN NULL ELSE agentic_runs."LastError" END,
       "LastAttemptAt"=CASE WHEN EXCLUDED."Status"='queued' THEN NULL ELSE agentic_runs."LastAttemptAt" END`,
    [params.Artikel_Nummer, params.SearchQuery ?? null, params.LastSearchLinksJson ?? null, params.Status, params.LastModified, params.ReviewState, params.ReviewedBy ?? null, params.LastReviewDecision ?? null, params.LastReviewNotes ?? null]
  );
}

export async function getAgenticRun(artikelNummer: string): Promise<AgenticRun | null> {
  return queryOne<AgenticRun>(
    `SELECT "Id","Artikel_Nummer","SearchQuery","LastSearchLinksJson","Status","LastModified","ReviewState","ReviewedBy",
            "LastReviewDecision","LastReviewNotes","RetryCount","NextRetryAt","LastError","LastAttemptAt"
     FROM agentic_runs WHERE "Artikel_Nummer"=$1`,
    [artikelNummer]
  );
}

export async function updateAgenticRunStatus(params: {
  Artikel_Nummer: string;
  Status: string;
  SearchQuery?: string | null;
  LastSearchLinksJson?: string | null;
  LastSearchLinksJsonIsSet?: boolean;
  LastModified: string;
  ReviewState: string;
  ReviewedBy?: string | null;
  ReviewedByIsSet?: boolean;
  LastReviewDecision?: string | null;
  LastReviewDecisionIsSet?: boolean;
  LastReviewNotes?: string | null;
  LastReviewNotesIsSet?: boolean;
  RetryCount?: number | null;
  RetryCountIsSet?: boolean;
  NextRetryAt?: string | null;
  NextRetryAtIsSet?: boolean;
  LastError?: string | null;
  LastErrorIsSet?: boolean;
  LastAttemptAt?: string | null;
  LastAttemptAtIsSet?: boolean;
}): Promise<number> {
  return execute(
    `UPDATE agentic_runs SET
       "Status"=$2,
       "SearchQuery"=COALESCE($3,"SearchQuery"),
       "LastSearchLinksJson"=CASE WHEN $4 THEN $5 ELSE "LastSearchLinksJson" END,
       "LastModified"=$6,
       "ReviewState"=$7,
       "ReviewedBy"=CASE WHEN $8 THEN $9 ELSE "ReviewedBy" END,
       "LastReviewDecision"=CASE WHEN $10 THEN COALESCE($11,"LastReviewDecision") ELSE "LastReviewDecision" END,
       "LastReviewNotes"=CASE WHEN $12 THEN COALESCE($13,"LastReviewNotes") ELSE "LastReviewNotes" END,
       "RetryCount"=CASE WHEN $14 THEN $15 ELSE "RetryCount" END,
       "NextRetryAt"=CASE WHEN $16 THEN $17 ELSE "NextRetryAt" END,
       "LastError"=CASE WHEN $18 THEN $19 ELSE "LastError" END,
       "LastAttemptAt"=CASE WHEN $20 THEN $21 ELSE "LastAttemptAt" END
     WHERE "Artikel_Nummer"=$1`,
    [
      params.Artikel_Nummer,
      params.Status,
      params.SearchQuery ?? null,
      params.LastSearchLinksJsonIsSet ?? false, params.LastSearchLinksJson ?? null,
      params.LastModified,
      params.ReviewState,
      params.ReviewedByIsSet ?? false, params.ReviewedBy ?? null,
      params.LastReviewDecisionIsSet ?? false, params.LastReviewDecision ?? null,
      params.LastReviewNotesIsSet ?? false, params.LastReviewNotes ?? null,
      params.RetryCountIsSet ?? false, params.RetryCount ?? 0,
      params.NextRetryAtIsSet ?? false, params.NextRetryAt ?? null,
      params.LastErrorIsSet ?? false, params.LastError ?? null,
      params.LastAttemptAtIsSet ?? false, params.LastAttemptAt ?? null
    ]
  );
}

export async function updateAgenticReview(params: {
  Artikel_Nummer: string;
  ReviewState: string;
  ReviewedBy: string | null;
  LastModified: string;
  LastReviewDecision: string | null;
  LastReviewNotes: string | null;
  Status?: string | null;
}): Promise<void> {
  await execute(
    `UPDATE agentic_runs SET
       "ReviewState"=$2,"ReviewedBy"=$3,"LastModified"=$4,
       "LastReviewDecision"=$5,"LastReviewNotes"=$6,
       "Status"=COALESCE($7,"Status")
     WHERE "Artikel_Nummer"=$1`,
    [params.Artikel_Nummer, params.ReviewState, params.ReviewedBy, params.LastModified, params.LastReviewDecision, params.LastReviewNotes, params.Status ?? null]
  );
}

export async function insertAgenticRunReviewHistoryEntry(params: {
  Artikel_Nummer: string;
  Status: string;
  ReviewState: string;
  ReviewDecision: string | null;
  ReviewNotes: string | null;
  ReviewMetadata: string | null;
  ReviewedBy: string | null;
  RecordedAt: string;
}): Promise<void> {
  await execute(
    `INSERT INTO agentic_run_review_history ("Artikel_Nummer","Status","ReviewState","ReviewDecision","ReviewNotes","ReviewMetadata","ReviewedBy","RecordedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [params.Artikel_Nummer, params.Status, params.ReviewState, params.ReviewDecision, params.ReviewNotes, params.ReviewMetadata, params.ReviewedBy, params.RecordedAt]
  );
}

export async function listAgenticRunReviewHistory(artikelNummer: string): Promise<AgenticRunReviewHistoryEntry[]> {
  const normalizedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!normalizedArtikelNummer) return [];
  try {
    return query<AgenticRunReviewHistoryEntry>(
      `SELECT "Id","Artikel_Nummer","Status","ReviewState","ReviewDecision","ReviewNotes","ReviewMetadata","ReviewedBy","RecordedAt"
       FROM agentic_run_review_history WHERE "Artikel_Nummer"=$1 ORDER BY "RecordedAt" ASC, "Id" ASC`,
      [normalizedArtikelNummer]
    );
  } catch (err) {
    console.error('[db] Failed to list agentic run review history', { artikelNummer: normalizedArtikelNummer, error: err });
    throw err;
  }
}

export async function listRecentAgenticRunReviewHistoryBySubcategory(subcategory: number, limit = 10): Promise<AgenticRunReviewHistoryEntry[]> {
  const normalizedSubcategory = Number.isInteger(subcategory) ? subcategory : Number.parseInt(String(subcategory), 10);
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10;
  if (!Number.isInteger(normalizedSubcategory) || normalizedSubcategory <= 0) return [];
  try {
    return query<AgenticRunReviewHistoryEntry>(
      `SELECT h."Id",h."Artikel_Nummer",h."Status",h."ReviewState",h."ReviewDecision",h."ReviewNotes",h."ReviewMetadata",h."ReviewedBy",h."RecordedAt"
       FROM agentic_run_review_history h
       JOIN item_refs r ON r."Artikel_Nummer"=h."Artikel_Nummer"
       WHERE ROUND(NULLIF(r."Unterkategorien_A", '')::NUMERIC)::INTEGER=$1
         AND (LOWER(COALESCE(h."ReviewState",'')) IN ('approved','rejected') OR COALESCE(TRIM(h."ReviewDecision"),'') <> '')
       ORDER BY h."RecordedAt" DESC, h."Id" DESC LIMIT $2`,
      [normalizedSubcategory, normalizedLimit]
    );
  } catch (err) {
    console.error('[db] Failed to list recent agentic run review history by subcategory', { subcategory: normalizedSubcategory, error: err });
    throw err;
  }
}

export async function persistAgenticRunError(params: { artikelNummer: string; error: string | null; attemptAt?: string | null }): Promise<void> {
  const artikelNummer = typeof params.artikelNummer === 'string' ? params.artikelNummer.trim() : '';
  if (!artikelNummer) {
    console.warn('[db] Skipping agentic run error persistence for empty Artikel_Nummer');
    return;
  }
  const normalizedError =
    typeof params.error === 'string' && params.error.trim()
      ? params.error.trim().slice(0, 500)
      : params.error === null ? null : String(params.error).slice(0, 500);
  const attemptAt = params.attemptAt ?? new Date().toISOString();
  try {
    const count = await execute(
      `UPDATE agentic_runs SET "LastError"=$2,"LastAttemptAt"=COALESCE($3,"LastAttemptAt"),"LastModified"=COALESCE($3,"LastModified")
       WHERE "Artikel_Nummer"=$1`,
      [artikelNummer, normalizedError, attemptAt]
    );
    if (count === 0) console.warn('[db] Agentic run error persistence affected zero rows', { artikelNummer });
  } catch (err) {
    console.error('[db] Failed to persist agentic run error', { artikelNummer, error: err });
    throw err;
  }
}

export type AgenticRunQueueUpdate = {
  Artikel_Nummer: string;
  Status?: string | null;
  LastModified: string;
  RetryCount: number;
  NextRetryAt: string | null;
  LastError: string | null;
  LastAttemptAt: string;
};

export async function fetchQueuedAgenticRuns(limit = 5): Promise<AgenticRun[]> {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  const now = new Date().toISOString();
  try {
    return query<AgenticRun>(
      `SELECT "Id","Artikel_Nummer","SearchQuery","LastSearchLinksJson","Status","LastModified","ReviewState","ReviewedBy",
              "LastReviewDecision","LastReviewNotes","RetryCount","NextRetryAt","LastError","LastAttemptAt"
       FROM agentic_runs
       WHERE "Status"='queued' AND ("NextRetryAt" IS NULL OR "NextRetryAt" <= $2)
       ORDER BY "LastModified" ASC, "Id" ASC LIMIT $1`,
      [effectiveLimit, now]
    );
  } catch (err) {
    console.error('[db] Failed to fetch queued agentic runs', err);
    throw err;
  }
}

export async function fetchIdleFillAgenticRuns(limit = 3): Promise<AgenticRun[]> {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 3;
  try {
    return query<AgenticRun>(
      `SELECT "Id","Artikel_Nummer","SearchQuery","LastSearchLinksJson","Status","LastModified","ReviewState","ReviewedBy",
              "LastReviewDecision","LastReviewNotes","RetryCount","NextRetryAt","LastError","LastAttemptAt"
       FROM agentic_runs
       WHERE "Status"='notStarted' AND "SearchQuery" IS NOT NULL AND TRIM("SearchQuery") != ''
       ORDER BY "LastModified" ASC, "Id" ASC LIMIT $1`,
      [effectiveLimit]
    );
  } catch (err) {
    console.error('[db] Failed to fetch idle-fill agentic runs', err);
    throw err;
  }
}

export async function updateQueuedAgenticRunQueueState(update: AgenticRunQueueUpdate): Promise<void> {
  try {
    const count = await execute(
      `UPDATE agentic_runs SET
         "Status"=COALESCE($2,"Status"),
         "LastModified"=$3,
         "RetryCount"=$4,
         "NextRetryAt"=$5,
         "LastError"=$6,
         "LastAttemptAt"=$7
       WHERE "Artikel_Nummer"=$1`,
      [update.Artikel_Nummer, update.Status ?? null, update.LastModified, update.RetryCount, update.NextRetryAt ?? null, update.LastError ?? null, update.LastAttemptAt]
    );
    if (count === 0) console.warn('[db] Agentic run queue update had no effect', { artikelNummer: update.Artikel_Nummer });
  } catch (err) {
    console.error('[db] Failed to update queued agentic run state', { artikelNummer: update.Artikel_Nummer, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Agentic request logs
// ---------------------------------------------------------------------------

export async function upsertAgenticRequestLog(log: AgenticRequestLogUpsert): Promise<void> {
  const uuid = typeof log.UUID === 'string' ? log.UUID.trim() : '';
  if (!uuid) {
    console.warn('[db] Skipping agentic request log upsert due to missing UUID');
    return;
  }
  const now = new Date().toISOString();
  const createdAt = toIsoString(log.CreatedAt) ?? now;
  const updatedAt = toIsoString(log.UpdatedAt) ?? now;
  const notifiedAt = toIsoString(log.NotifiedAt) ?? null;
  const errorIsSet = Object.prototype.hasOwnProperty.call(log, 'Error');
  const lastNotificationErrorIsSet = Object.prototype.hasOwnProperty.call(log, 'LastNotificationError');

  try {
    await execute(
      `INSERT INTO agentic_request_logs ("UUID","Search","Status","Error","CreatedAt","UpdatedAt","NotifiedAt","LastNotificationError","PayloadJson")
       VALUES ($1,$2,$3,$4,COALESCE($5,$6),COALESCE($7,$6),$8,$9,$10)
       ON CONFLICT("UUID") DO UPDATE SET
         "Search"=COALESCE(EXCLUDED."Search",agentic_request_logs."Search"),
         "Status"=COALESCE(EXCLUDED."Status",agentic_request_logs."Status"),
         "Error"=CASE WHEN $11 THEN EXCLUDED."Error" ELSE agentic_request_logs."Error" END,
         "UpdatedAt"=COALESCE(EXCLUDED."UpdatedAt",agentic_request_logs."UpdatedAt"),
         "NotifiedAt"=COALESCE(EXCLUDED."NotifiedAt",agentic_request_logs."NotifiedAt"),
         "LastNotificationError"=CASE WHEN $12 THEN EXCLUDED."LastNotificationError" ELSE agentic_request_logs."LastNotificationError" END,
         "PayloadJson"=COALESCE(EXCLUDED."PayloadJson",agentic_request_logs."PayloadJson")`,
      [
        uuid,
        asNullableTrimmedString(log.Search),
        asNullableTrimmedString(log.Status),
        errorIsSet ? asNullableString(log.Error) : null,
        createdAt, now,
        updatedAt,
        notifiedAt,
        lastNotificationErrorIsSet ? asNullableString(log.LastNotificationError) : null,
        log.PayloadJson ?? null,
        errorIsSet,
        lastNotificationErrorIsSet
      ]
    );
  } catch (err) {
    console.error('[db] Failed to upsert agentic_request_logs row', { uuid, error: err });
    throw err;
  }
}

export async function logAgenticRequestStart(uuid: string, search: string | null): Promise<void> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) { console.warn('[db] Cannot persist agentic request start without UUID'); return; }
  const now = new Date().toISOString();
  try {
    await execute(
      `INSERT INTO agentic_request_logs ("UUID","Search","Status","Error","CreatedAt","UpdatedAt","LastNotificationError")
       VALUES ($1,$2,'RUNNING',NULL,$3,$3,NULL)
       ON CONFLICT("UUID") DO UPDATE SET
         "Search"=EXCLUDED."Search","Status"=EXCLUDED."Status","Error"=NULL,
         "UpdatedAt"=EXCLUDED."UpdatedAt","LastNotificationError"=NULL,"NotifiedAt"=NULL,"PayloadJson"=NULL`,
      [trimmedUuid, asNullableTrimmedString(search), now]
    );
  } catch (err) {
    console.error('[db] Failed to persist agentic request start', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export async function logAgenticRequestEnd(uuid: string, status: string, error: string | null): Promise<void> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) { console.warn('[db] Cannot persist agentic request completion without UUID'); return; }
  const now = new Date().toISOString();
  try {
    const count = await execute(
      `UPDATE agentic_request_logs SET "Status"=$2,"Error"=$3,"UpdatedAt"=$4 WHERE "UUID"=$1`,
      [trimmedUuid, asNullableTrimmedString(status), asNullableString(error), now]
    );
    if (count === 0) {
      console.warn('[db] Agentic request completion updated zero rows; inserting fallback entry', { uuid: trimmedUuid });
      await upsertAgenticRequestLog({ UUID: trimmedUuid, Status: status, Error: error, UpdatedAt: now });
    }
  } catch (err) {
    console.error('[db] Failed to persist agentic request completion', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export async function saveAgenticRequestPayload(uuid: string, payload: unknown): Promise<void> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) { console.warn('[db] Cannot persist agentic request payload without UUID'); return; }
  let payloadJson: string | null = null;
  try { payloadJson = JSON.stringify(payload ?? null); } catch (err) { console.error('[db] Failed to serialize agentic request payload', { uuid: trimmedUuid, error: err }); }
  const now = new Date().toISOString();
  try {
    const count = await execute(
      `UPDATE agentic_request_logs SET "PayloadJson"=$2,"UpdatedAt"=$3 WHERE "UUID"=$1`,
      [trimmedUuid, payloadJson, now]
    );
    if (count === 0) await upsertAgenticRequestLog({ UUID: trimmedUuid, PayloadJson: payloadJson, UpdatedAt: now });
  } catch (err) {
    console.error('[db] Failed to persist agentic request payload', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export async function markAgenticRequestNotificationSuccess(uuid: string, completedAtIso: string | null = null): Promise<void> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) { console.warn('[db] Cannot mark agentic request notification success without UUID'); return; }
  const now = new Date().toISOString();
  const notifiedAt = toIsoString(completedAtIso) ?? now;
  try {
    const count = await execute(
      `UPDATE agentic_request_logs SET "NotifiedAt"=$2,"LastNotificationError"=NULL,"UpdatedAt"=$3 WHERE "UUID"=$1`,
      [trimmedUuid, notifiedAt, now]
    );
    if (count === 0) await upsertAgenticRequestLog({ UUID: trimmedUuid, NotifiedAt: notifiedAt, LastNotificationError: null, UpdatedAt: now });
  } catch (err) {
    console.error('[db] Failed to mark agentic notification success', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export async function markAgenticRequestNotificationFailure(uuid: string, errorMessage: string): Promise<void> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) { console.warn('[db] Cannot mark agentic request notification failure without UUID'); return; }
  const now = new Date().toISOString();
  try {
    const count = await execute(
      `UPDATE agentic_request_logs SET "LastNotificationError"=$2,"UpdatedAt"=$3 WHERE "UUID"=$1`,
      [trimmedUuid, asNullableString(errorMessage), now]
    );
    if (count === 0) await upsertAgenticRequestLog({ UUID: trimmedUuid, LastNotificationError: errorMessage, UpdatedAt: now });
  } catch (err) {
    console.error('[db] Failed to mark agentic notification failure', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

export async function listPendingAgenticRequestNotifications(limit = 10): Promise<AgenticRequestNotification[]> {
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  let rows: Array<{ UUID: string; PayloadJson: string | null }> = [];
  try {
    rows = await query(
      `SELECT "UUID","PayloadJson" FROM agentic_request_logs
       WHERE "Status"='SUCCESS' AND "NotifiedAt" IS NULL AND "PayloadJson" IS NOT NULL
       ORDER BY "UpdatedAt" ASC LIMIT $1`,
      [effectiveLimit]
    );
  } catch (err) {
    console.error('[db] Failed to query pending agentic request notifications', { limit: effectiveLimit, error: err });
    throw err;
  }
  const notifications: AgenticRequestNotification[] = [];
  for (const row of rows) {
    if (row.PayloadJson === null) continue;
    try {
      const parsed = JSON.parse(row.PayloadJson);
      notifications.push({ UUID: row.UUID, Payload: parsed });
    } catch (err) {
      console.error('[db] Failed to parse agentic request payload_json', { uuid: row.UUID, error: err });
    }
  }
  return notifications;
}

export async function getAgenticRequestLog(uuid: string): Promise<AgenticRequestLog | null> {
  const trimmedUuid = typeof uuid === 'string' ? uuid.trim() : '';
  if (!trimmedUuid) return null;
  try {
    return queryOne<AgenticRequestLog>(
      `SELECT "UUID","Search","Status","Error","CreatedAt","UpdatedAt","NotifiedAt","LastNotificationError","PayloadJson"
       FROM agentic_request_logs WHERE "UUID"=$1`,
      [trimmedUuid]
    );
  } catch (err) {
    console.error('[db] Failed to load agentic_request_logs row', { uuid: trimmedUuid, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Shopware sync queue
// ---------------------------------------------------------------------------

export async function clearShopwareSyncQueue(): Promise<void> {
  await execute(`DELETE FROM shopware_sync_queue`);
}

export async function listShopwareSyncQueue(): Promise<ShopwareSyncQueueEntry[]> {
  return query<ShopwareSyncQueueEntry>(`SELECT * FROM shopware_sync_queue ORDER BY "Id"`);
}

export async function enqueueShopwareSyncJob(job: ShopwareSyncQueueInsert): Promise<ShopwareSyncQueueEntry> {
  const now = new Date().toISOString();
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
    return insert<ShopwareSyncQueueEntry>(
      `INSERT INTO shopware_sync_queue ("CorrelationId","JobType","Payload","Status","RetryCount","LastError","LastAttemptAt","NextAttemptAt","CreatedAt","UpdatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [entry.CorrelationId, entry.JobType, entry.Payload, entry.Status, entry.RetryCount, entry.LastError, entry.LastAttemptAt, entry.NextAttemptAt, now]
    );
  } catch (err) {
    console.error('[db] Failed to enqueue Shopware sync job', { correlationId: job.CorrelationId, jobType: job.JobType, error: err });
    throw err;
  }
}

export async function claimShopwareSyncJobs(limit: number, attemptIso: string): Promise<ShopwareSyncQueueEntry[]> {
  try {
    return query<ShopwareSyncQueueEntry>(
      `UPDATE shopware_sync_queue SET "Status"='processing',"LastAttemptAt"=$2,"UpdatedAt"=$2
       WHERE "Id" IN (
         SELECT "Id" FROM shopware_sync_queue
         WHERE "Status"='queued' AND ("NextAttemptAt" IS NULL OR "NextAttemptAt" <= $2)
         ORDER BY "CreatedAt" ASC, "Id" ASC LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit, attemptIso]
    );
  } catch (err) {
    console.error('[db] Failed to claim Shopware sync jobs', err);
    throw err;
  }
}

export async function markShopwareSyncJobSucceeded(id: number, completedAtIso: string): Promise<void> {
  try {
    await execute(
      `UPDATE shopware_sync_queue SET "Status"='succeeded',"RetryCount"=0,"LastError"=NULL,"NextAttemptAt"=NULL,"UpdatedAt"=$2 WHERE "Id"=$1`,
      [id, completedAtIso]
    );
  } catch (err) {
    console.error('[db] Failed to mark Shopware sync job succeeded', { jobId: id, error: err });
    throw err;
  }
}

export async function rescheduleShopwareSyncJob(params: { id: number; retryCount: number; error: string | null; nextAttemptAt: string; updatedAt: string }): Promise<void> {
  try {
    await execute(
      `UPDATE shopware_sync_queue SET "Status"='queued',"RetryCount"=$2,"LastError"=$3,"NextAttemptAt"=$4,"UpdatedAt"=$5 WHERE "Id"=$1`,
      [params.id, params.retryCount, params.error, params.nextAttemptAt, params.updatedAt]
    );
  } catch (err) {
    console.error('[db] Failed to reschedule Shopware sync job', { jobId: params.id, error: err });
    throw err;
  }
}

export async function markShopwareSyncJobFailed(params: { id: number; error: string | null; updatedAt: string }): Promise<void> {
  try {
    await execute(
      `UPDATE shopware_sync_queue SET "Status"='failed',"LastError"=$2,"NextAttemptAt"=NULL,"UpdatedAt"=$3 WHERE "Id"=$1`,
      [params.id, params.error, params.updatedAt]
    );
  } catch (err) {
    console.error('[db] Failed to mark Shopware sync job failed', { jobId: params.id, error: err });
    throw err;
  }
}

export async function getShopwareSyncJobById(id: number): Promise<ShopwareSyncQueueEntry | undefined> {
  const row = await queryOne<ShopwareSyncQueueEntry>(`SELECT * FROM shopware_sync_queue WHERE "Id"=$1`, [id]);
  return row ?? undefined;
}

// ---------------------------------------------------------------------------
// Quality assessments
// ---------------------------------------------------------------------------

export interface QualityAssessmentInsertWithContract extends QualityAssessmentInsert {
  checkResponse?: QualityCheckResponse;
}

export async function insertQualityAssessment(assessment: QualityAssessmentInsertWithContract): Promise<number> {
  const { checkResponse } = assessment;
  const row = await insert<{ id: number }>(
    `INSERT INTO quality_assessments ("tag","value","is_complete","has_defects","is_functional","notes","reviewed_at","reviewed_by","responses","contract_version","derived_specs")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      assessment.tag,
      assessment.value,
      assessment.is_complete === null ? null : assessment.is_complete ? 1 : 0,
      assessment.has_defects === null ? null : assessment.has_defects ? 1 : 0,
      assessment.is_functional === null ? null : assessment.is_functional ? 1 : 0,
      assessment.notes,
      assessment.reviewed_at,
      assessment.reviewed_by,
      checkResponse ? JSON.stringify(checkResponse.answers) : null,
      checkResponse ? JSON.stringify({ general: checkResponse.generalContractVersion, ...(checkResponse.subCategoryContractVersion !== undefined ? { subCat: checkResponse.subCategoryContractVersion } : {}) }) : null,
      checkResponse && Object.keys(checkResponse.derivedSpecs).length > 0 ? JSON.stringify(checkResponse.derivedSpecs) : null
    ]
  );
  return Number(row.id);
}

export async function getQualityAssessment(id: number): Promise<QualityAssessment | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT id,tag,value,is_complete,has_defects,is_functional,notes,reviewed_at,reviewed_by FROM quality_assessments WHERE id=$1`,
    [id]
  );
  if (!row) return null;
  return {
    id: row['id'] as number,
    tag: row['tag'] as QualityAssessment['tag'],
    value: row['value'] as number,
    is_complete: row['is_complete'] === null ? null : Boolean(row['is_complete']),
    has_defects: row['has_defects'] === null ? null : Boolean(row['has_defects']),
    is_functional: row['is_functional'] === null ? null : Boolean(row['is_functional']),
    notes: (row['notes'] as string | null) ?? null,
    reviewed_at: row['reviewed_at'] as string,
    reviewed_by: row['reviewed_by'] as string
  };
}

export async function updateItemQualityAssessment(itemUUID: string, qualityId: number, value: number): Promise<void> {
  await execute(`UPDATE items SET "QualityId"=$2,"Quality"=$3 WHERE "ItemUUID"=$1`, [itemUUID, qualityId, value]);
}

export async function getItemQualityResponses(itemUUID: string): Promise<{ responses: Record<string, string>; notes: string | null }> {
  const itemRow = await queryOne<{ QualityId: number | null }>(`SELECT "QualityId" FROM items WHERE "ItemUUID"=$1`, [itemUUID]);
  if (!itemRow || itemRow.QualityId == null) return { responses: {}, notes: null };
  const qaRow = await queryOne<Record<string, unknown>>(
    `SELECT responses,notes FROM quality_assessments WHERE id=$1`,
    [itemRow.QualityId]
  );
  if (!qaRow) return { responses: {}, notes: null };
  let responses: Record<string, string> = {};
  if (typeof qaRow['responses'] === 'string') {
    try {
      const parsed = JSON.parse(qaRow['responses']) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        responses = parsed as Record<string, string>;
      }
    } catch { /* stored JSON is corrupt — return empty */ }
  }
  return { responses, notes: (qaRow['notes'] as string | null) ?? null };
}

export async function updateItemInstanceSpecs(itemUUID: string, derivedSpecs: Record<string, string>): Promise<void> {
  const row = await queryOne<{ InstanceSpecs: string | null }>(`SELECT "InstanceSpecs" FROM items WHERE "ItemUUID"=$1`, [itemUUID]);
  if (!row) return;
  const existing = parseLangtext(row.InstanceSpecs) ?? {};
  const base: Record<string, string | string[]> = typeof existing === 'string' ? {} : { ...existing };
  for (const [key, value] of Object.entries(derivedSpecs)) base[key] = value;
  const serialized = stringifyLangtext(base);
  if (serialized !== null) {
    await execute(`UPDATE items SET "InstanceSpecs"=$2 WHERE "ItemUUID"=$1`, [itemUUID, serialized]);
  }
}

export async function updateItemLangtextSpecs(itemUUID: string, derivedSpecs: Record<string, string>): Promise<void> {
  const row = await queryOne<{ Langtext: string | null }>(
    `SELECT "Langtext" FROM item_refs WHERE "Artikel_Nummer"=(SELECT "Artikel_Nummer" FROM items WHERE "ItemUUID"=$1)`,
    [itemUUID]
  );
  if (!row) return;
  const existing = parseLangtext(row.Langtext) ?? {};
  const base: Record<string, string | string[]> = typeof existing === 'string' ? {} : { ...existing };
  for (const [key, value] of Object.entries(derivedSpecs)) base[key] = value;
  const serialized = stringifyLangtext(base);
  if (serialized !== null) {
    await execute(
      `UPDATE item_refs SET "Langtext"=$1 WHERE "Artikel_Nummer"=(SELECT "Artikel_Nummer" FROM items WHERE "ItemUUID"=$2)`,
      [serialized, itemUUID]
    );
  }
}

// ---------------------------------------------------------------------------
// Box stubs
// ---------------------------------------------------------------------------

export type BoxStub = {
  Id: string;
  ShelfId: string;
  Description: string;
  NumberLooseItems: number;
  CreatedAt: string;
  CreatedBy: string;
  IsActive: number;
  Notes: string | null;
};

export const listStubs = {
  active: async (): Promise<BoxStub[]> => {
    const rows = await query<BoxStub>(`SELECT * FROM box_stubs ORDER BY "CreatedAt" DESC`);
    return rows.filter((r) => r.IsActive === 1);
  },
  all: async (): Promise<BoxStub[]> => query<BoxStub>(`SELECT * FROM box_stubs ORDER BY "CreatedAt" DESC`)
};

export async function createStub(params: {
  id: string;
  shelfId: string;
  description: string;
  numberLooseItems: number;
  createdAt: string;
  createdBy: string;
  notes: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO box_stubs ("Id","ShelfId","Description","NumberLooseItems","NumberLooseBoxes","CreatedAt","CreatedBy","IsActive","Notes")
     VALUES ($1,$2,$3,$4,0,$5,$6,1,$7)`,
    [params.id, params.shelfId, params.description, params.numberLooseItems, params.createdAt, params.createdBy, params.notes ?? null]
  );
}

// ---------------------------------------------------------------------------
// Type re-exports
// ---------------------------------------------------------------------------

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

// ── User item marks ──────────────────────────────────────────────────────────

export async function getUserMarks(username: string): Promise<Array<{ ItemUUID: string; Note: string | null }>> {
  const rows = await query<{ ItemUUID: string; Note: string | null }>(
    `SELECT "ItemUUID", "Note" FROM user_item_marks WHERE "Username" = $1`,
    [username]
  );
  return rows;
}

export async function markItem(username: string, itemUUID: string, note: string | null = null): Promise<void> {
  await execute(
    `INSERT INTO user_item_marks ("Username", "ItemUUID", "Note")
     VALUES ($1, $2, $3)
     ON CONFLICT ("Username", "ItemUUID") DO UPDATE SET "Note" = EXCLUDED."Note"`,
    [username, itemUUID, note]
  );
}

export async function unmarkItem(username: string, itemUUID: string): Promise<void> {
  await execute(
    `DELETE FROM user_item_marks WHERE "Username" = $1 AND "ItemUUID" = $2`,
    [username, itemUUID]
  );
}

export async function getUserMark(username: string, itemUUID: string): Promise<{ Note: string | null } | null> {
  return queryOne<{ Note: string | null }>(
    `SELECT "Note" FROM user_item_marks WHERE "Username" = $1 AND "ItemUUID" = $2`,
    [username, itemUUID]
  );
}
