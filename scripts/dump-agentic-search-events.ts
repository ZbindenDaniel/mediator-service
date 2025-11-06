import Database from 'better-sqlite3';
import path from 'path';
import { DB_PATH } from '../backend/config';

interface AgenticEventRow {
  CreatedAt: string;
  ItemUUID: string;
  Meta: string | null;
  Event: AgenticEventName;
}

const NEW_AGENTIC_EVENT_NAMES = Object.freeze(['AgenticRunQueued', 'AgenticRunRequeued'] as const);
const LEGACY_AGENTIC_EVENT_NAMES = Object.freeze(['AgenticSearchQueued'] as const);
const TRACKED_AGENTIC_EVENT_NAMES = Object.freeze([
  ...NEW_AGENTIC_EVENT_NAMES,
  ...LEGACY_AGENTIC_EVENT_NAMES,
] as const);

type AgenticEventName = (typeof TRACKED_AGENTIC_EVENT_NAMES)[number];

// TODO: Consider adding CLI arguments for date range filtering if analysts require narrower slices.

function openDatabase(dbPath: string): Database.Database {
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (error) {
    console.error('[dump-agentic-search-events] Failed to open database', { dbPath, error });
    throw error;
  }
}

function loadAgenticEvents(database: Database.Database): AgenticEventRow[] {
  try {
    const placeholders = TRACKED_AGENTIC_EVENT_NAMES.map((_, index) => `@event${index}`).join(', ');
    const statement = database.prepare(
      `SELECT CreatedAt, EntityId AS ItemUUID, Meta, Event FROM events WHERE Event IN (${placeholders}) ORDER BY datetime(CreatedAt) ASC`
    );
    const parameters = TRACKED_AGENTIC_EVENT_NAMES.reduce<Record<string, string>>((accumulator, eventName, index) => {
      accumulator[`event${index}`] = eventName;
      return accumulator;
    }, {});
    return statement.all(parameters) as AgenticEventRow[];
  } catch (error) {
    console.error('[dump-agentic-search-events] Query failed for agentic queue events', error);
    throw error;
  }
}

function summarizeDuplicates(
  events: AgenticEventRow[]
): Array<{ ItemUUID: string; count: number; eventName: AgenticEventName }> {
  const counts = new Map<string, { ItemUUID: string; count: number; eventName: AgenticEventName }>();
  for (const event of events) {
    const key = `${event.Event}::${event.ItemUUID}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { ItemUUID: event.ItemUUID, count: 1, eventName: event.Event });
    }
  }
  return Array.from(counts.values())
    .filter((entry) => entry.count > 1)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      if (a.eventName !== b.eventName) {
        return a.eventName.localeCompare(b.eventName);
      }
      return a.ItemUUID.localeCompare(b.ItemUUID);
    });
}

function formatEventLabel(eventName: AgenticEventName): string {
  const isLegacy = LEGACY_AGENTIC_EVENT_NAMES.includes(eventName as (typeof LEGACY_AGENTIC_EVENT_NAMES)[number]);
  return isLegacy ? `${eventName} (legacy)` : eventName;
}

function buildEventLines(events: AgenticEventRow[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    const meta = parseMeta(event.Meta);
    const metaSummary = meta ? JSON.stringify(meta) : 'null';
    lines.push(`[${formatEventLabel(event.Event)}] ${event.CreatedAt}\t${event.ItemUUID}\t${metaSummary}`);
  }
  return lines;
}

function buildDuplicateLines(
  duplicates: Array<{ ItemUUID: string; count: number; eventName: AgenticEventName }>
): string[] {
  const lines: string[] = [];
  for (const duplicate of duplicates) {
    lines.push(`[${formatEventLabel(duplicate.eventName)}] ${duplicate.ItemUUID}\t${duplicate.count}`);
  }
  return lines;
}

function parseMeta(meta: string | null): Record<string, unknown> | null {
  if (!meta) {
    return null;
  }

  try {
    return JSON.parse(meta) as Record<string, unknown>;
  } catch (error) {
    console.warn('[dump-agentic-search-events] Failed to parse Meta column as JSON; skipping meta output', error);
    return null;
  }
}

export function main(): void {
  const resolvedDbPath = path.resolve(DB_PATH);
  console.info('[dump-agentic-search-events] Opening database in read-only mode', { resolvedDbPath });

  const database = openDatabase(resolvedDbPath);

  try {
    const events = loadAgenticEvents(database);
    const countsByEvent = events.reduce<Record<AgenticEventName, number>>((accumulator, event) => {
      accumulator[event.Event] = (accumulator[event.Event] ?? 0) + 1;
      return accumulator;
    }, {} as Record<AgenticEventName, number>);
    console.info('[dump-agentic-search-events] Retrieved agentic queue events', {
      total: events.length,
      countsByEvent,
    });

    if (events.length === 0) {
      console.info('[dump-agentic-search-events] No agentic queue events found');
      return;
    }

    console.log('\n=== Agentic queue events ===');
    for (const line of buildEventLines(events)) {
      console.log(line);
    }

    const duplicates = summarizeDuplicates(events);
    if (duplicates.length === 0) {
      console.log('\nNo duplicate ItemUUID entries detected.');
      return;
    }

    console.log('\n=== Duplicate ItemUUID occurrences by event ===');
    for (const line of buildDuplicateLines(duplicates)) {
      console.log(line);
    }
  } catch (error) {
    console.error('[dump-agentic-search-events] Unexpected failure while dumping events', error);
    process.exitCode = 1;
  } finally {
    try {
      database.close();
      console.info('[dump-agentic-search-events] Database connection closed');
    } catch (error) {
      console.warn('[dump-agentic-search-events] Failed to close database cleanly', error);
    }
  }
}

if (require.main === module) {
  main();
}

export {
  buildDuplicateLines,
  buildEventLines,
  loadAgenticEvents,
  summarizeDuplicates,
  TRACKED_AGENTIC_EVENT_NAMES,
  LEGACY_AGENTIC_EVENT_NAMES,
  NEW_AGENTIC_EVENT_NAMES,
};
