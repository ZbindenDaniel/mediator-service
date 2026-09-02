jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

const insertEventLogEntry = jest.fn(async () => true);

jest.mock('../backend/db', () => ({
  runUpsertBox: jest.fn(async () => true),
  persistItem: jest.fn(),
  queueLabel: jest.fn(),
  persistItemReference: jest.fn(),
  upsertAgenticRun: jest.fn(),
  findByMaterial: jest.fn(async () => null),
  getMaxArtikelNummer: jest.fn(async () => null),
  insertEventLogEntry,
  logEvent: jest.fn(async () => undefined),
  hasItemReferenceByArtikelNummer: jest.fn(async () => false),
}));

import { ingestEventsCsv } from '../backend/importer';

const HEADER = 'CreatedAt,Actor,EntityType,EntityId,Event,Level,Meta';

function metaFor(entityId: string): unknown {
  const call = insertEventLogEntry.mock.calls.find(
    (args: any[]) => args[0]?.EntityId === entityId
  );
  return (call?.[0] as any)?.Meta;
}

describe('ingestEventsCsv — Meta jsonb sanitization', () => {
  beforeEach(() => {
    insertEventLogEntry.mockClear();
  });

  test('passes through valid JSON Meta unchanged', async () => {
    const meta = JSON.stringify({ fromBox: null, before: 3, after: 2 });
    const csv = `${HEADER}\n2026-01-01T00:00:00Z,tester,Item,111,Removed,Information,"${meta.replace(/"/g, '""')}"`;
    const result = await ingestEventsCsv(csv);
    expect(result.count).toBe(1);
    expect(metaFor('111')).toBe(meta);
  });

  test('replaces a non-JSON Meta ("[object Object]" export artifact) with null but still imports the row', async () => {
    const csv = `${HEADER}\n2026-01-01T00:00:00Z,tester,Item,222,Removed,Information,[object Object]`;
    const result = await ingestEventsCsv(csv);
    // The event is preserved (not dropped) and Meta is nulled instead of aborting the jsonb insert.
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(0);
    expect(metaFor('222')).toBeNull();
  });

  test('treats empty Meta as null', async () => {
    const csv = `${HEADER}\n2026-01-01T00:00:00Z,tester,Item,333,Removed,Information,`;
    const result = await ingestEventsCsv(csv);
    expect(result.count).toBe(1);
    expect(metaFor('333')).toBeNull();
  });
});
