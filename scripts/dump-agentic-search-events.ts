import Database from 'better-sqlite3';
import path from 'path';
import { DB_PATH } from '../backend/config';

interface AgenticEventRow {
  CreatedAt: string;
  ItemUUID: string;
  Meta: string | null;
}

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
    const statement = database.prepare(
      `SELECT CreatedAt, EntityId AS ItemUUID, Meta FROM events WHERE Event = @event ORDER BY datetime(CreatedAt) ASC`
    );
    return statement.all({ event: 'AgenticSearchQueued' }) as AgenticEventRow[];
  } catch (error) {
    console.error('[dump-agentic-search-events] Query failed for AgenticSearchQueued events', error);
    throw error;
  }
}

function summarizeDuplicates(events: AgenticEventRow[]): Array<{ ItemUUID: string; count: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const current = counts.get(event.ItemUUID) ?? 0;
    counts.set(event.ItemUUID, current + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([ItemUUID, count]) => ({ ItemUUID, count }))
    .sort((a, b) => b.count - a.count || a.ItemUUID.localeCompare(b.ItemUUID));
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

function main(): void {
  const resolvedDbPath = path.resolve(DB_PATH);
  console.info('[dump-agentic-search-events] Opening database in read-only mode', { resolvedDbPath });

  const database = openDatabase(resolvedDbPath);

  try {
    const events = loadAgenticEvents(database);
    console.info('[dump-agentic-search-events] Retrieved AgenticSearchQueued events', { count: events.length });

    if (events.length === 0) {
      console.info('[dump-agentic-search-events] No AgenticSearchQueued events found');
      return;
    }

    console.log('\n=== AgenticSearchQueued events ===');
    for (const event of events) {
      const meta = parseMeta(event.Meta);
      const metaSummary = meta ? JSON.stringify(meta) : 'null';
      console.log(`${event.CreatedAt}\t${event.ItemUUID}\t${metaSummary}`);
    }

    const duplicates = summarizeDuplicates(events);
    if (duplicates.length === 0) {
      console.log('\nNo duplicate ItemUUID entries detected.');
      return;
    }

    console.log('\n=== Duplicate ItemUUID occurrences ===');
    for (const duplicate of duplicates) {
      console.log(`${duplicate.ItemUUID}\t${duplicate.count}`);
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

main();
