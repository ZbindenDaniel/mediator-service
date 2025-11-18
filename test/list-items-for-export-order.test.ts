import fs from 'fs';
import path from 'path';

// TODO(agent): Extend export ordering fixtures with Artikel_Nummer-null scenarios once ingestion stabilizes.
const TEST_DB_FILE = path.join(__dirname, 'list-items-for-export-order.test.sqlite');
const ORIGINAL_DB_PATH = process.env.DB_PATH;

function removeTestDatabase(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${TEST_DB_FILE}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }
}

removeTestDatabase();
process.env.DB_PATH = TEST_DB_FILE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db, listItemsForExport, persistItem } = require('../backend/persistence');

function clearDatabase(): void {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[list-items-for-export-order.test] Failed to clear database', error);
    throw error;
  }
}

describe('listItemsForExport ordering', () => {
  beforeEach(() => {
    clearDatabase();
  });

  afterAll(() => {
    try {
      db.close();
    } catch (error) {
      console.warn('[list-items-for-export-order.test] Failed to close database cleanly', error);
    }
    removeTestDatabase();
    if (ORIGINAL_DB_PATH === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = ORIGINAL_DB_PATH;
    }
  });

  test('sorts exports by Artikel_Nummer with ItemUUID as a tie-breaker', () => {
    const baseTimestamp = new Date('2024-01-01T00:00:00.000Z');

    const fixtures = [
      {
        ItemUUID: 'I-EXPORT-0001',
        Artikel_Nummer: 'B-200',
        Datum_erfasst: new Date(baseTimestamp.getTime() + 2),
      },
      {
        ItemUUID: 'I-EXPORT-0002',
        Artikel_Nummer: 'A-100',
        Datum_erfasst: new Date(baseTimestamp.getTime()),
      },
      {
        ItemUUID: 'I-EXPORT-0003',
        Artikel_Nummer: 'A-100',
        Datum_erfasst: new Date(baseTimestamp.getTime() + 1),
      },
    ];

    try {
      for (const fixture of fixtures) {
        persistItem({
          ItemUUID: fixture.ItemUUID,
          Artikel_Nummer: fixture.Artikel_Nummer,
          BoxID: null,
          Location: null,
          UpdatedAt: fixture.Datum_erfasst,
          Datum_erfasst: fixture.Datum_erfasst,
          Auf_Lager: 1,
          Langtext: null,
        });
      }
    } catch (error) {
      console.error('[list-items-for-export-order.test] Failed to persist fixtures', error);
      throw error;
    }

    const exported = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    const orderedItemUUIDs = exported.map((row: any) => row.ItemUUID);

    expect(orderedItemUUIDs).toEqual(['I-EXPORT-0002', 'I-EXPORT-0003', 'I-EXPORT-0001']);
  });
});
