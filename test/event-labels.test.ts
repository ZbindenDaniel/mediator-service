import {
  EVENT_DEFAULT_LEVEL,
  EVENT_LABELS,
  EVENT_RESOURCES,
  eventLabel,
  eventLevel,
  resolveEventResource,
} from '../models/event-labels';

test('event label translations', () => {
  expect(eventLabel('Edit')).toBe('Bearbeitet');
  expect(eventLabel('AgenticResultReceived')).toBe('Ki-Ergebnis erhalten');
  expect(eventLabel('QrScanned')).toBe('QR-Code gescannt');
  expect(eventLabel('UnknownEvent')).toBe('UnknownEvent');
});

test('event level helpers', () => {
  expect(eventLevel('Deleted')).toBe('error');
  expect(eventLevel('AgenticResultReceived')).toBe('info');
  expect(eventLevel('AgenticReviewRejected')).toBe('important');
  expect(eventLevel('UnknownEvent')).toBe(EVENT_DEFAULT_LEVEL);
});

test('event resources expose lookup map', () => {
  const deleted = resolveEventResource('Deleted');
  expect(deleted).toEqual({ key: 'Deleted', label: 'Gelöscht', level: 'error', topic: 'general' });
  expect(EVENT_LABELS.Deleted).toBe('Gelöscht');
  expect(Array.isArray(EVENT_RESOURCES)).toBe(true);
});

test('event resources include topic metadata', () => {
  const agentic = resolveEventResource('AgenticReviewRejected');
  expect(agentic?.topic).toBe('agentic');
});
