import {
  EVENT_DEFAULT_LEVEL,
  EVENT_LABELS,
  EVENT_RESOURCES,
  EVENT_TOPICS,
  eventKeysForTopics,
  eventLabel,
  eventLevel,
  parseEventTopicAllowList,
  resolveEventResource,
} from '../models/event-labels';

test('event label translations', () => {
  expect(eventLabel('Edit')).toBe('Bearbeitet');
  expect(eventLabel('AgenticResultReceived')).toBe('Ki-Ergebnis erhalten');
  expect(eventLabel('QrScanned')).toBe('QR-Code gescannt');
  expect(eventLabel('UnknownEvent')).toBe('UnknownEvent');
});

test('event level helpers', () => {
  expect(eventLevel('Deleted')).toBe('important');
  expect(eventLevel('AgenticResultReceived')).toBe('info');
  expect(eventLevel('AgenticReviewRejected')).toBe('important');
  expect(eventLevel('AgenticReviewSubmitted')).toBe('info');
  expect(eventLevel('UnknownEvent')).toBe(EVENT_DEFAULT_LEVEL);
});

test('event resources expose lookup map', () => {
  const deleted = resolveEventResource('Deleted');
  expect(deleted).toEqual({ key: 'Deleted', label: 'Gelöscht', level: 'important', topic: 'data' });
  expect(EVENT_LABELS.Deleted).toBe('Gelöscht');
  expect(Array.isArray(EVENT_RESOURCES)).toBe(true);
});

test('event resources include topic metadata', () => {
  const agentic = resolveEventResource('AgenticReviewRejected');
  expect(agentic?.topic).toBe('agentic');
});

test('event topic allow list parsing recognizes configured topics', () => {
  const { topics, invalid, hadInput, usedFallback } = parseEventTopicAllowList('general, agentic ,UNKNOWN');
  expect(hadInput).toBe(true);
  expect(usedFallback).toBe(false);
  expect(invalid).toEqual(['UNKNOWN']);
  expect(topics).toEqual(['general', 'agentic']);
});

test('event topic allow list falls back to all topics when none match', () => {
  const { topics, invalid, usedFallback } = parseEventTopicAllowList('missing');
  expect(usedFallback).toBe(true);
  expect(invalid).toEqual(['missing']);
  expect(topics).toEqual([...EVENT_TOPICS]);
});

test('eventKeysForTopics maps topics to event keys', () => {
  const agenticKeys = eventKeysForTopics(['agentic']);
  expect(agenticKeys).toEqual(
    expect.arrayContaining([
      'AgenticRunRestarted',
      'AgenticResultFailed',
      'AgenticReviewRejected',
      'AgenticReviewSubmitted'
    ])
  );
  expect(agenticKeys).not.toContain('Moved');
});
