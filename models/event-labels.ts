// Event label metadata is sourced from the JSON resources defined alongside this module.
import rawEventResources from './event-resources.json';

export type EventLevel = 'info' | 'important' | 'error';

export interface EventResource {
  key: string;
  label: string;
  level: EventLevel;
  topic: string;
}

const LOGGER_PREFIX = '[event-labels]';
export const EVENT_DEFAULT_LEVEL: EventLevel = 'info';
const EVENT_TOPIC_INDEX = new Map<string, string>();

function normalizeEventResources(data: unknown): EventResource[] {
  try {
    if (!Array.isArray(data)) {
      console.error(`${LOGGER_PREFIX} Expected array payload for event resources.`, data);
      return [];
    }

    const normalized: EventResource[] = [];

    for (const entry of data) {
      const candidate = entry as Partial<EventResource>;
      const { key, label, level, topic } = candidate;

      if (!key || typeof key !== 'string') {
        console.warn(`${LOGGER_PREFIX} Skipping event resource without valid key.`, entry);
        continue;
      }

      if (!label || typeof label !== 'string') {
        console.warn(`${LOGGER_PREFIX} Skipping event resource without valid label.`, { key, entry });
        continue;
      }

      if (!level || typeof level !== 'string') {
        console.warn(`${LOGGER_PREFIX} Skipping event resource without valid level.`, { key, entry });
        continue;
      }

      if (!['info', 'important', 'error'].includes(level)) {
        console.warn(`${LOGGER_PREFIX} Skipping event resource with unknown level.`, { key, level });
        continue;
      }

      if (!topic || typeof topic !== 'string') {
        console.warn(`${LOGGER_PREFIX} Skipping event resource without valid topic.`, { key, entry });
        continue;
      }

      const normalizedTopic = topic.trim();

      if (!normalizedTopic) {
        console.warn(`${LOGGER_PREFIX} Skipping event resource with empty topic.`, { key, entry });
        continue;
      }

      normalized.push({ key, label, level: level as EventLevel, topic: normalizedTopic });
    }

    return normalized;
  } catch (error) {
    console.error(`${LOGGER_PREFIX} Failed to normalize event resources.`, error);
    return [];
  }
}

export const EVENT_RESOURCES: EventResource[] = normalizeEventResources(rawEventResources);

const EVENT_RESOURCE_MAP = new Map<string, EventResource>();
export const EVENT_LABELS: Record<string, string> = {};
const EVENT_TOPIC_TO_KEYS = new Map<string, Set<string>>();

// TODO(agent): Consider surfacing topic descriptions alongside labels for UI tooltips.

for (const resource of EVENT_RESOURCES) {
  if (EVENT_RESOURCE_MAP.has(resource.key)) {
    console.warn(`${LOGGER_PREFIX} Duplicate event resource detected; latest value wins.`, resource.key);
  }

  EVENT_RESOURCE_MAP.set(resource.key, resource);
  EVENT_LABELS[resource.key] = resource.label;
  const existing = EVENT_TOPIC_TO_KEYS.get(resource.topic) ?? new Set<string>();
  existing.add(resource.key);
  EVENT_TOPIC_TO_KEYS.set(resource.topic, existing);
  EVENT_TOPIC_INDEX.set(resource.topic.toLowerCase(), resource.topic);
}

export const EVENT_TOPICS: readonly string[] = Object.freeze([...EVENT_TOPIC_TO_KEYS.keys()]);

export function resolveEventResource(eventKey: string): EventResource | undefined {
  if (!eventKey) {
    console.warn(`${LOGGER_PREFIX} resolveEventResource called without a key.`);
    return undefined;
  }

  return EVENT_RESOURCE_MAP.get(eventKey);
}

export function eventLabel(eventKey: string): string {
  try {
    const resource = resolveEventResource(eventKey);

    if (!resource) {
      console.warn(`${LOGGER_PREFIX} Missing event label for key, falling back to key.`, { eventKey });
      return eventKey;
    }

    return resource.label;
  } catch (error) {
    console.error(`${LOGGER_PREFIX} Failed to resolve event label.`, { eventKey, error });
    return eventKey;
  }
}

export function eventLevel(eventKey: string): EventLevel {
  try {
    const resource = resolveEventResource(eventKey);

    if (!resource) {
      console.warn(`${LOGGER_PREFIX} Missing event level for key, falling back to default.`, { eventKey, defaultLevel: EVENT_DEFAULT_LEVEL });
      return EVENT_DEFAULT_LEVEL;
    }

    return resource.level;
  } catch (error) {
    console.error(`${LOGGER_PREFIX} Failed to resolve event level.`, { eventKey, error });
    return EVENT_DEFAULT_LEVEL;
  }
}

export function resolveEventTopic(eventKey: string): string | undefined {
  const resource = resolveEventResource(eventKey);
  return resource?.topic;
}

function normalizeEventTopic(topic: string | null | undefined): string | null {
  if (typeof topic !== 'string') {
    return null;
  }

  const trimmed = topic.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = EVENT_TOPIC_INDEX.get(trimmed.toLowerCase());
  return normalized ?? null;
}

export function parseEventTopicAllowList(
  raw: string | null | undefined
): { topics: string[]; invalid: string[]; hadInput: boolean; usedFallback: boolean } {
  const hadInput = typeof raw === 'string' && raw.trim().length > 0;
  if (!hadInput) {
    return { topics: [...EVENT_TOPICS], invalid: [], hadInput: false, usedFallback: false };
  }

  const entries = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return { topics: [...EVENT_TOPICS], invalid: [], hadInput: true, usedFallback: true };
  }

  const normalized = new Set<string>();
  const invalid: string[] = [];

  for (const entry of entries) {
    const resolved = normalizeEventTopic(entry);
    if (resolved) {
      normalized.add(resolved);
    } else {
      invalid.push(entry);
    }
  }

  if (normalized.size === 0) {
    return { topics: [...EVENT_TOPICS], invalid, hadInput: true, usedFallback: true };
  }

  return { topics: Array.from(normalized), invalid, hadInput: true, usedFallback: false };
}

export function eventKeysForTopics(topics: Iterable<string>): string[] {
  const allowedKeys = new Set<string>();
  for (const topic of topics) {
    const keys = EVENT_TOPIC_TO_KEYS.get(topic);
    if (keys) {
      for (const key of keys) {
        allowedKeys.add(key);
      }
    } else {
      console.warn(`${LOGGER_PREFIX} eventKeysForTopics requested for unknown topic; skipping.`, { topic });
    }
  }
  return Array.from(allowedKeys);
}

export default {
  EVENT_RESOURCES,
  EVENT_LABELS,
  EVENT_TOPICS,
  eventLabel,
  eventLevel,
  resolveEventResource,
  resolveEventTopic,
  EVENT_DEFAULT_LEVEL,
  parseEventTopicAllowList,
  eventKeysForTopics
};
