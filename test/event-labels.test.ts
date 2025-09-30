const { eventLabel } = require('../models/event-labels.js');

test('event label translations', () => {
  expect(eventLabel('Edit')).toBe('Bearbeitet');
  expect(eventLabel('AgenticResultReceived')).toBe('Agentic-Ergebnis erhalten');
  expect(eventLabel('QrScanned')).toBe('QR-Code gescannt');
  expect(eventLabel('UnknownEvent')).toBe('UnknownEvent');
});
