import assert from 'node:assert';
import { eventLabel } from '../v2/backend/event-labels';

assert.strictEqual(eventLabel('Edit'), 'Bearbeitet');
assert.strictEqual(eventLabel('UnknownEvent'), 'UnknownEvent');

console.log('event-labels: ok');
