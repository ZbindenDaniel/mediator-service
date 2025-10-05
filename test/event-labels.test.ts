const { eventLabel } = require('../models/event-labels.ts');

test('event label translations', () => {
  expect(eventLabel('Edit')).toBe('Bearbeitet');
  expect(eventLabel('UnknownEvent')).toBe('UnknownEvent');
});
