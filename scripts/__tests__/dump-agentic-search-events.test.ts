import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import {
  buildDuplicateLines,
  buildEventLines,
  loadAgenticEvents,
  summarizeDuplicates,
} from '../dump-agentic-search-events';

describe('dump-agentic-search-events integration', () => {
  test('loads both agentic run event names and labels output with event type', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-events-'));
    const dbPath = path.join(tempDir, 'events.sqlite');

    const writable = new Database(dbPath);
    try {
      writable.exec(
        `CREATE TABLE events (
          CreatedAt TEXT NOT NULL,
          EntityId TEXT NOT NULL,
          Meta TEXT,
          Event TEXT NOT NULL
        )`
      );
      const insert = writable.prepare(
        'INSERT INTO events (CreatedAt, EntityId, Meta, Event) VALUES (@CreatedAt, @EntityId, @Meta, @Event)'
      );
      const seedRows = [
        {
          CreatedAt: '2024-07-01T10:00:00Z',
          EntityId: 'ITEM-001',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 1 }),
          Event: 'AgenticRunQueued',
        },
        {
          CreatedAt: '2024-07-01T10:05:00Z',
          EntityId: 'ITEM-001',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 2 }),
          Event: 'AgenticRunQueued',
        },
        {
          CreatedAt: '2024-07-01T11:00:00Z',
          EntityId: 'ITEM-002',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 1 }),
          Event: 'AgenticRunRequeued',
        },
        {
          CreatedAt: '2024-07-01T11:10:00Z',
          EntityId: 'ITEM-002',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 2 }),
          Event: 'AgenticRunRequeued',
        },
        {
          CreatedAt: '2024-07-01T12:00:00Z',
          EntityId: 'ITEM-003',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 1 }),
          Event: 'AgenticSearchQueued',
        },
        {
          CreatedAt: '2024-07-01T12:10:00Z',
          EntityId: 'ITEM-003',
          Meta: JSON.stringify({ Status: 'queued', Attempt: 2 }),
          Event: 'AgenticSearchQueued',
        },
      ];
      for (const row of seedRows) {
        insert.run(row);
      }
    } finally {
      writable.close();
    }

    const reader = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const events = loadAgenticEvents(reader);
      expect(events).toHaveLength(6);
      expect(events.map((event) => event.Event)).toEqual([
        'AgenticRunQueued',
        'AgenticRunQueued',
        'AgenticRunRequeued',
        'AgenticRunRequeued',
        'AgenticSearchQueued',
        'AgenticSearchQueued',
      ]);

      const eventLines = buildEventLines(events);
      expect(eventLines).toContain(
        '[AgenticRunQueued] 2024-07-01T10:00:00Z\tITEM-001\t{"Status":"queued","Attempt":1}'
      );
      expect(eventLines).toContain(
        '[AgenticRunRequeued] 2024-07-01T11:00:00Z\tITEM-002\t{"Status":"queued","Attempt":1}'
      );
      expect(eventLines).toContain(
        '[AgenticSearchQueued (legacy)] 2024-07-01T12:00:00Z\tITEM-003\t{"Status":"queued","Attempt":1}'
      );

      const duplicates = summarizeDuplicates(events);
      const duplicateLines = buildDuplicateLines(duplicates);
      expect(duplicateLines).toEqual([
        '[AgenticRunQueued] ITEM-001\t2',
        '[AgenticRunRequeued] ITEM-002\t2',
        '[AgenticSearchQueued (legacy)] ITEM-003\t2',
      ]);
    } finally {
      reader.close();
    }
  });
});
