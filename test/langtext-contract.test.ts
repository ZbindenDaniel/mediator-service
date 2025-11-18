import fs from 'fs';
import path from 'path';

// TODO(agent): Broaden Langtext API assertions once HTTP handlers gain dedicated fixtures.

const TEST_DB_FILE = path.join(__dirname, 'langtext-contract.test.sqlite');
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
const { db, listItems, listItemsForExport, persistItem } = require('../backend/persistence');

function clearDatabase(): void {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[langtext-contract.test] Failed to clear database', error);
    throw error;
  }
}

describe('Langtext contract alignment', () => {
  beforeEach(() => {
    clearDatabase();
  });

  afterAll(() => {
    try {
      db.close();
    } catch (error) {
      console.warn('[langtext-contract.test] Failed to close database cleanly', error);
    }
    removeTestDatabase();
    if (ORIGINAL_DB_PATH === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = ORIGINAL_DB_PATH;
    }
  });

  test('list APIs surface parsed Langtext payloads', () => {
    const itemUUID = 'LANGTEXT-ITEM-001';
    const artikelNummer = 'LANGTEXT-ART-001';
    const langtextPayload = { de: 'Beschreibung', en: 'Description' };

    persistItem({
      ItemUUID: itemUUID,
      Artikel_Nummer: artikelNummer,
      BoxID: null,
      Location: null,
      UpdatedAt: new Date(),
      Datum_erfasst: new Date(),
      Auf_Lager: 1,
      Langtext: langtextPayload
    });

    const listed = listItems.all();
    const listedItem = listed.find((row: any) => row.ItemUUID === itemUUID);
    expect(listedItem?.Langtext).toEqual(langtextPayload);

    const exported = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    const exportedItem = exported.find((row: any) => row.ItemUUID === itemUUID);
    expect(exportedItem?.Langtext).toEqual(langtextPayload);
  });
});
