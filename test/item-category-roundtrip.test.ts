import fs from 'fs';
import path from 'path';

import { ItemEinheit } from '../models';

const TEST_DB_FILE = path.join(__dirname, 'item-category-roundtrip.test.sqlite');
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
const { db, persistItem, getItem } = require('../backend/db');

const selectReference = db.prepare(
  `
    SELECT
      Hauptkategorien_A AS HauptA,
      Unterkategorien_A AS UnterA,
      Hauptkategorien_B AS HauptB,
      Unterkategorien_B AS UnterB
    FROM item_refs
    WHERE Artikel_Nummer = ?
  `
);

function clearDatabase(): void {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[item-category-roundtrip.test] Failed to clear database', error);
    throw error;
  }
}

beforeEach(() => {
  clearDatabase();
});

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[item-category-roundtrip.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('item category round-trip without Artikel_Nummer', () => {
  test('persists and retrieves category metadata via ItemUUID fallback', () => {
    const itemId = 'I-TEST-0001';

    expect(() =>
      persistItem({
        ItemUUID: itemId,
        Artikel_Nummer: undefined,
        BoxID: null,
        Location: null,
        UpdatedAt: new Date('2024-06-30T10:15:00Z'),
        Datum_erfasst: undefined,
        Auf_Lager: 3,
        Artikelbeschreibung: 'Fallback key item',
        Hauptkategorien_A: 1001,
        Unterkategorien_A: 10011,
        Hauptkategorien_B: 2002,
        Unterkategorien_B: 20022,
        Einheit: ItemEinheit.Stk
      })
    ).not.toThrow();

    const referenceRow = selectReference.get(itemId) as
      | { HauptA: number | null; UnterA: number | null; HauptB: number | null; UnterB: number | null }
      | undefined;

    expect(referenceRow).toBeDefined();
    if (!referenceRow) {
      throw new Error('item reference row missing for fallback key assertions');
    }

    expect(referenceRow.HauptA).toBe(1001);
    expect(referenceRow.UnterA).toBe(10011);
    expect(referenceRow.HauptB).toBe(2002);
    expect(referenceRow.UnterB).toBe(20022);

    const storedItem = getItem.get(itemId) as
      | {
          Hauptkategorien_A?: number | null;
          Unterkategorien_A?: number | null;
          Hauptkategorien_B?: number | null;
          Unterkategorien_B?: number | null;
        }
      | undefined;

    expect(storedItem).toBeDefined();
    if (!storedItem) {
      throw new Error('persisted item row missing for category verification');
    }

    expect(storedItem.Hauptkategorien_A).toBe(1001);
    expect(storedItem.Unterkategorien_A).toBe(10011);
    expect(storedItem.Hauptkategorien_B).toBe(2002);
    expect(storedItem.Unterkategorien_B).toBe(20022);
  });
});
