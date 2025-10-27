import {
  EVENT_LOG_LEVELS,
  EventLog,
  EventLogLevel,
  parseEventLogLevelAllowList
} from '../../../models';

type MaybeNodeProcess = typeof process | { env?: Record<string, string | undefined> };

function resolveEventLevelConfig(): string | null {
  const candidateProcess = (globalThis as { process?: MaybeNodeProcess }).process;
  if (candidateProcess && typeof candidateProcess === 'object' && candidateProcess.env) {
    const raw = candidateProcess.env.EVENT_LOG_LEVELS;
    if (typeof raw === 'string') {
      return raw;
    }
  }
  return null;
}

const {
  levels: frontendEventLevels,
  invalid: frontendInvalidLevels,
  hadInput: frontendHadInput,
  usedFallback: frontendUsedFallback
} = parseEventLogLevelAllowList(resolveEventLevelConfig());

if (typeof console !== 'undefined') {
  if (!frontendHadInput) {
    console.info('[ui] EVENT_LOG_LEVELS not configured; defaulting to all event levels.');
  } else {
    if (frontendInvalidLevels.length > 0) {
      console.warn('[ui] EVENT_LOG_LEVELS contains unknown values; ignoring invalid entries.', {
        invalid: frontendInvalidLevels
      });
    }
    if (frontendUsedFallback) {
      console.warn('[ui] EVENT_LOG_LEVELS produced no recognized levels; defaulting to all levels.');
    }
  }
}

const allowedLevels = frontendEventLevels.length > 0 ? frontendEventLevels : [...EVENT_LOG_LEVELS];

export const FRONTEND_EVENT_LOG_LEVELS: readonly EventLogLevel[] = Object.freeze([...allowedLevels]);
const FRONTEND_LEVEL_SET = new Set(FRONTEND_EVENT_LOG_LEVELS);

export function isEventLevelAllowed(level: EventLogLevel | string | null | undefined): boolean {
  if (!level) {
    return FRONTEND_LEVEL_SET.has(EventLogLevel.Information);
  }
  if (typeof level === 'string') {
    const normalized = FRONTEND_EVENT_LOG_LEVELS.find(
      (candidate) => candidate.toLowerCase() === level.toLowerCase()
    );
    return normalized ? FRONTEND_LEVEL_SET.has(normalized) : false;
  }
  return FRONTEND_LEVEL_SET.has(level);
}

export function filterAllowedEvents<T extends Pick<EventLog, 'Level'>>(events: T[]): T[] {
  return events.filter((event) => isEventLevelAllowed(event.Level));
}

