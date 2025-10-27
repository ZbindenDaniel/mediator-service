import { eventLevel as resolveEventLevel, type EventLevel } from './event-labels';

export enum EventLogLevel {
  Debug = 'Debug',
  Information = 'Information',
  Important = 'Important',
  Error = 'Error'
}

export interface EventLog {
  Id: number;
  CreatedAt: string;
  Actor?: string | null;
  EntityType: string;
  EntityId: string;
  Event: string;
  Level: EventLogLevel;
  Meta?: string | null;
  Artikelbeschreibung?: string | null;
  Artikel_Nummer?: string | null;
}

export const EVENT_LOG_LEVELS: readonly EventLogLevel[] = Object.freeze([
  EventLogLevel.Debug,
  EventLogLevel.Information,
  EventLogLevel.Important,
  EventLogLevel.Error
]);

const LOGGER_PREFIX = '[event-log]';

const EVENT_RESOURCE_LEVEL_TO_LOG_LEVEL: Record<EventLevel, EventLogLevel> = {
  info: EventLogLevel.Information,
  important: EventLogLevel.Important,
  error: EventLogLevel.Error
};

// TODO: Extend resolveEventLogLevel to support topic-aware overrides when defined.
export function resolveEventLogLevel(eventKey: string): EventLogLevel {
  try {
    const normalized = resolveEventLevel(eventKey);
    const mapped = EVENT_RESOURCE_LEVEL_TO_LOG_LEVEL[normalized];

    if (mapped) {
      return mapped;
    }

    console.warn(`${LOGGER_PREFIX} Unknown resource level resolved for event; defaulting to information.`, {
      eventKey,
      normalized
    });
  } catch (error) {
    console.error(`${LOGGER_PREFIX} Failed to resolve event log level; defaulting to information.`, {
      eventKey,
      error
    });
  }

  return EventLogLevel.Information;
}

export function normalizeEventLogLevel(value: string | null | undefined): EventLogLevel | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  return EVENT_LOG_LEVELS.find((level) => level.toLowerCase() === lower) ?? null;
}

export function parseEventLogLevelAllowList(
  raw: string | null | undefined
): { levels: EventLogLevel[]; invalid: string[]; hadInput: boolean; usedFallback: boolean } {
  const hadInput = typeof raw === 'string' && raw.trim().length > 0;
  if (!hadInput) {
    return { levels: [...EVENT_LOG_LEVELS], invalid: [], hadInput: false, usedFallback: false };
  }

  const entries = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return { levels: [...EVENT_LOG_LEVELS], invalid: [], hadInput: true, usedFallback: true };
  }

  const normalized = new Set<EventLogLevel>();
  const invalid: string[] = [];

  for (const entry of entries) {
    const resolved = normalizeEventLogLevel(entry);
    if (resolved) {
      normalized.add(resolved);
    } else {
      invalid.push(entry);
    }
  }

  if (normalized.size === 0) {
    return { levels: [...EVENT_LOG_LEVELS], invalid, hadInput: true, usedFallback: true };
  }

  return { levels: Array.from(normalized), invalid, hadInput: true, usedFallback: false };
}
