import { EventLogLevel } from '../models';
import type { EventLog } from '../models';

const ORIGINAL_EVENT_LOG_TOPICS = process.env.EVENT_LOG_TOPICS;

const baseEvents: EventLog[] = [
  {
    Id: 1,
    CreatedAt: '2024-01-01T00:00:00.000Z',
    Actor: 'tester',
    EntityType: 'Item',
    EntityId: 'I-0001',
    Event: 'Moved',
    Level: EventLogLevel.Important
  },
  {
    Id: 2,
    CreatedAt: '2024-01-02T00:00:00.000Z',
    Actor: 'agent',
    EntityType: 'Item',
    EntityId: 'I-0002',
    Event: 'AgenticRunRestarted',
    Level: EventLogLevel.Information
  }
];

function loadTopicsModule(raw: string | undefined) {
  if (raw === undefined) {
    delete process.env.EVENT_LOG_TOPICS;
  } else {
    process.env.EVENT_LOG_TOPICS = raw;
  }

  const modulePath = require.resolve('../frontend/src/utils/eventLogTopics');
  delete require.cache[modulePath];
  return require(modulePath) as typeof import('../frontend/src/utils/eventLogTopics');
}

afterEach(() => {
  if (ORIGINAL_EVENT_LOG_TOPICS === undefined) {
    delete process.env.EVENT_LOG_TOPICS;
  } else {
    process.env.EVENT_LOG_TOPICS = ORIGINAL_EVENT_LOG_TOPICS;
  }
  delete require.cache[require.resolve('../frontend/src/utils/eventLogTopics')];
});

test('filterVisibleEvents allows all topics when unset', () => {
  const { filterVisibleEvents, FRONTEND_EVENT_LOG_TOPICS } = loadTopicsModule(undefined);
  expect(FRONTEND_EVENT_LOG_TOPICS.length).toBeGreaterThan(0);
  expect(filterVisibleEvents(baseEvents)).toHaveLength(baseEvents.length);
});

test('filterVisibleEvents blocks disallowed topics', () => {
  const { filterVisibleEvents } = loadTopicsModule('agentic');
  const filtered = filterVisibleEvents(baseEvents);
  expect(filtered).toHaveLength(1);
  expect(filtered[0].Event).toBe('AgenticRunRestarted');
});

test('filterVisibleEvents falls back to all topics on invalid input', () => {
  const { filterVisibleEvents } = loadTopicsModule('unknown-topic');
  expect(filterVisibleEvents(baseEvents)).toHaveLength(baseEvents.length);
});
