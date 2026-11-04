import type { EventLog } from '../../../models';

/** A rendered activities row: a day header, a single event, or a folded burst of similar events. */
export type ActivityRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; event: EventLog }
  | { kind: 'burst'; key: string; events: EventLog[] };

/** Consecutive events closer than this (and same Event + Actor + EntityType) fold into one burst. */
export const BURST_GAP_MS = 10 * 60 * 1000;
/** Fewer than this many similar events stay as individual rows. */
export const BURST_MIN_SIZE = 3;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  return date.toLocaleDateString('de-CH', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sameBurst(a: EventLog, b: EventLog): boolean {
  if (a.Event !== b.Event || (a.Actor ?? '') !== (b.Actor ?? '') || a.EntityType !== b.EntityType) return false;
  const gap = Math.abs(Date.parse(a.CreatedAt) - Date.parse(b.CreatedAt));
  return Number.isFinite(gap) && gap <= BURST_GAP_MS;
}

/**
 * Turns a newest-first event list into display rows. Grouping runs over everything loaded so far
 * (not per page), so a burst split by "Mehr laden" re-joins once the next page arrives.
 */
export function buildActivityRows(events: EventLog[], now: Date = new Date()): ActivityRow[] {
  const rows: ActivityRow[] = [];
  let currentDay: string | null = null;
  let run: EventLog[] = [];

  const flush = () => {
    if (run.length >= BURST_MIN_SIZE) {
      rows.push({ kind: 'burst', key: `burst-${run[0].Id}`, events: run });
    } else {
      for (const event of run) rows.push({ kind: 'event', key: `event-${event.Id}`, event });
    }
    run = [];
  };

  for (const event of events) {
    const created = new Date(event.CreatedAt);
    const validDate = !Number.isNaN(created.getTime());
    const day = validDate ? dayKey(created) : 'unknown';
    if (day !== currentDay) {
      flush();
      currentDay = day;
      rows.push({ kind: 'day', key: `day-${day}-${event.Id}`, label: validDate ? formatDayLabel(created, now) : 'Unbekanntes Datum' });
    }
    if (run.length && !sameBurst(run[run.length - 1], event)) flush();
    run.push(event);
  }
  flush();
  return rows;
}
