import fs from 'fs';
import path from 'path';
import { KNOWN_EVENT_KEYS, eventKeysForLevels, eventLevel } from '../models/event-labels';
import { resolveEventLogLevel, EventLogLevel } from '../models';

// Unregistered event keys silently resolve to level 'error' and show up as failures in the feed;
// this guard catches the next `Event: 'Foo'` added without an event-resources.json entry.
function collectLoggedEventKeys(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectLoggedEventKeys(full, found);
    } else if (entry.name.endsWith('.ts')) {
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(/\bEvent:\s*'([A-Za-z]+)'/g)) found.add(match[1]);
    }
  }
  return found;
}

describe('event resources', () => {
  it('registers every event key logged by the backend', () => {
    const logged = collectLoggedEventKeys(path.join(__dirname, '..', 'backend'));
    const known = new Set(KNOWN_EVENT_KEYS);
    expect([...logged].filter((key) => !known.has(key))).toEqual([]);
  });

  it('classifies bulk per-item noise as debug and keeps summaries visible', () => {
    const debugKeys = eventKeysForLevels(['debug']);
    expect(debugKeys).toEqual(expect.arrayContaining(['ShopStatusUpdated', 'AgenticResultReceived', 'AgenticSearchQueued']));
    expect(eventLevel('ShopStatusBulkUpdated')).toBe('info');
    expect(eventLevel('AgenticBulkQueued')).toBe('info');
    expect(resolveEventLogLevel('ShopStatusUpdated')).toBe(EventLogLevel.Debug);
  });
});
