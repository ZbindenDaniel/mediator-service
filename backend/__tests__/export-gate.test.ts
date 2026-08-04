// Mock the db-client layer so we can import the real db.ts helpers without a database.
const mockExecute = jest.fn(async () => 1);
const mockQueryOne = jest.fn(async () => null as any);
const mockQuery = jest.fn(async () => [] as any[]);

jest.mock('../db-client', () => ({
  query: (...a: any[]) => mockQuery(...a),
  queryOne: (...a: any[]) => mockQueryOne(...a),
  execute: (...a: any[]) => mockExecute(...a),
  insert: jest.fn(async () => ({})),
  withTransaction: jest.fn(async (fn: any) => fn({ query: jest.fn(async () => ({ rows: [], rowCount: 0 })) })),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 1),
  getPoolInstance: jest.fn(() => null),
  execBatch: jest.fn(async () => undefined),
}));

import { IN_DEVICE_COMPONENT_SQL, queueLabel, listItemsForExport } from '../db';

beforeEach(() => {
  mockExecute.mockClear();
  mockQueryOne.mockClear();
  mockQuery.mockClear();
});

describe('IN_DEVICE_COMPONENT_SQL predicate', () => {
  test('identifies a boxless Zerlegt_aus child', () => {
    expect(IN_DEVICE_COMPONENT_SQL).toContain('"BoxID" IS NULL');
    expect(IN_DEVICE_COMPONENT_SQL).toContain("'Zerlegt_aus'");
    expect(IN_DEVICE_COMPONENT_SQL).toContain('ChildItemUUID');
  });
});

describe('listItemsForExport gate', () => {
  test('excludes in-device components from the export query', async () => {
    await listItemsForExport({});
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain(`NOT ${IN_DEVICE_COMPONENT_SQL}`);
  });
});

describe('queueLabel reference-less guard', () => {
  test('skips enqueue for a component with no Artikelnummer', async () => {
    mockQueryOne.mockResolvedValueOnce({ Artikel_Nummer: null });
    await queueLabel('C-comp1');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('skips enqueue for an empty-string Artikelnummer', async () => {
    mockQueryOne.mockResolvedValueOnce({ Artikel_Nummer: '   ' });
    await queueLabel('C-comp2');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('enqueues a normal item with a reference', async () => {
    mockQueryOne.mockResolvedValueOnce({ Artikel_Nummer: '000042' });
    await queueLabel('I-000042-0001');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO label_queue'),
      expect.arrayContaining(['I-000042-0001'])
    );
  });
});
