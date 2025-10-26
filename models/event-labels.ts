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

// TODO: Implement topic-based filtering for event logs once requirements are defined.

for (const resource of EVENT_RESOURCES) {
  if (EVENT_RESOURCE_MAP.has(resource.key)) {
    console.warn(`${LOGGER_PREFIX} Duplicate event resource detected; latest value wins.`, resource.key);
  }

  EVENT_RESOURCE_MAP.set(resource.key, resource);
  EVENT_LABELS[resource.key] = resource.label;
}

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

export default {
  EVENT_RESOURCES,
  EVENT_LABELS,
  eventLabel,
  eventLevel,
  resolveEventResource,
  EVENT_DEFAULT_LEVEL,
};
