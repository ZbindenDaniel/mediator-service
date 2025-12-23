import { EventLog } from '../../../models';
import { EVENT_TOPICS, parseEventTopicAllowList, resolveEventTopic } from '../../../models/event-labels';
import { filterAllowedEvents } from './eventLogLevels';

type MaybeNodeProcess = typeof process | { env?: Record<string, string | undefined> };

function resolveEventTopicConfig(): string | null {
  const candidateProcess = (globalThis as { process?: MaybeNodeProcess }).process;
  if (candidateProcess && typeof candidateProcess === 'object' && candidateProcess.env) {
    const raw = candidateProcess.env.EVENT_LOG_TOPICS;
    if (typeof raw === 'string') {
      return raw;
    }
  }
  return null;
}

const {
  topics: frontendEventTopics,
  invalid: frontendInvalidTopics,
  hadInput: frontendHadTopicInput,
  usedFallback: frontendTopicFallback
} = parseEventTopicAllowList(resolveEventTopicConfig());

if (typeof console !== 'undefined') {
  if (!frontendHadTopicInput) {
    console.info('[ui] EVENT_LOG_TOPICS not configured; defaulting to all topics.');
  } else {
    if (frontendInvalidTopics.length > 0) {
      console.warn('[ui] EVENT_LOG_TOPICS contains unknown values; ignoring invalid entries.', {
        invalid: frontendInvalidTopics
      });
    }
    if (frontendTopicFallback) {
      console.warn('[ui] EVENT_LOG_TOPICS produced no recognized topics; defaulting to all topics.');
    }
  }
}

const allowedTopics = frontendEventTopics.length > 0 ? frontendEventTopics : [...EVENT_TOPICS];
export const FRONTEND_EVENT_LOG_TOPICS: readonly string[] = Object.freeze([...allowedTopics]);
const FRONTEND_TOPIC_SET = new Set(FRONTEND_EVENT_LOG_TOPICS);
const TOPIC_FILTER_ENABLED =
  FRONTEND_EVENT_LOG_TOPICS.length > 0 && FRONTEND_EVENT_LOG_TOPICS.length < EVENT_TOPICS.length;
const UNKNOWN_EVENT_TOPICS = new Set<string>();

export function isEventTopicAllowed(event: EventLog): boolean {
  if (!TOPIC_FILTER_ENABLED) {
    return true;
  }

  const topic = resolveEventTopic(event.Event);
  if (!topic) {
    if (typeof console !== 'undefined' && !UNKNOWN_EVENT_TOPICS.has(event.Event)) {
      UNKNOWN_EVENT_TOPICS.add(event.Event);
      console.warn('[ui] Event topic missing for key; filtering out due to topic allow list.', {
        eventKey: event.Event
      });
    }
    return false;
  }

  return FRONTEND_TOPIC_SET.has(topic);
}

export function filterEventsByTopic(events: EventLog[]): EventLog[] {
  if (!Array.isArray(events) || events.length === 0) {
    return events;
  }

  if (!TOPIC_FILTER_ENABLED) {
    return events;
  }

  return events.filter((event) => isEventTopicAllowed(event));
}

export function filterVisibleEvents(events: EventLog[]): EventLog[] {
  return filterAllowedEvents(filterEventsByTopic(events));
}
