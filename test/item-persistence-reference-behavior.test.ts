import fs from 'fs';
import path from 'path';
import { ItemEinheit } from '../models';

const TEST_DB_FILE = path.join(__dirname, 'item-persistence-reference-behavior.sqlite');
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
const { db, persistItemWithinTransaction } = require('../backend/db');

const selectReference = db.prepare(
  `SELECT Artikel_Nummer, Artikelbeschreibung, Kurzbeschreibung, Langtext, Hersteller, Verkaufspreis, Einheit, Shopartikel
   FROM item_refs WHERE Artikel_Nummer = ?`
);
const selectInstance = db.prepare('SELECT Artikel_Nummer FROM items WHERE ItemUUID = ?');

function clearDatabase(): void {
  db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
}

describe('item persistence reference behavior', () => {
  beforeEach(() => {
    clearDatabase();
  });

  afterAll(() => {
    try {
      db.close();
    } catch (error) {
      console.warn('[item-persistence-reference-behavior.test] Failed to close database', error);
    }
    removeTestDatabase();
    if (ORIGINAL_DB_PATH === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = ORIGINAL_DB_PATH;
    }
  });

  test('full item creation persists reference and instance rows', () => {
    const now = new Date('2024-04-05T12:00:00Z');
    persistItemWithinTransaction({
      ItemUUID: 'I-DB-0001',
      Artikel_Nummer: 'DB-REF-0001',
      BoxID: null,
      Location: null,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 3,
      Artikelbeschreibung: 'Kompletter Persistenztest',
      Kurzbeschreibung: 'Kurzbeschreibung',
      Langtext: 'Ausführliche Beschreibung',
      Hersteller: 'Test GmbH',
      Verkaufspreis: 5.75,
      Einheit: ItemEinheit.Stk,
      Shopartikel: 1
    });

    const referenceRow = selectReference.get('DB-REF-0001') as
      | {
          Artikel_Nummer: string;
          Artikelbeschreibung: string | null;
          Kurzbeschreibung: string | null;
          Langtext: string | null;
          Hersteller: string | null;
          Verkaufspreis: number | null;
          Einheit: string | null;
          Shopartikel: number | null;
        }
      | undefined;
    expect(referenceRow).toEqual({
      Artikel_Nummer: 'DB-REF-0001',
      Artikelbeschreibung: 'Kompletter Persistenztest',
      Kurzbeschreibung: 'Kurzbeschreibung',
      Langtext: 'Ausführliche Beschreibung',
      Hersteller: 'Test GmbH',
      Verkaufspreis: 5.75,
      Einheit: ItemEinheit.Stk,
      Shopartikel: 1
    });

    const instanceRow = selectInstance.get('I-DB-0001') as { Artikel_Nummer: string | null } | undefined;
    expect(instanceRow).toEqual({ Artikel_Nummer: 'DB-REF-0001' });
  });

  test('creating an item from an existing reference leaves the reference row untouched', () => {
    const seedTimestamp = new Date('2024-04-05T12:05:00Z');
    const referenceSeed = {
      ItemUUID: 'I-DB-SEED-0001',
      Artikel_Nummer: 'DB-REF-0002',
      BoxID: null,
      Location: null,
      UpdatedAt: seedTimestamp,
      Datum_erfasst: seedTimestamp,
      Auf_Lager: 2,
      Artikelbeschreibung: 'Referenzierter Artikel',
      Kurzbeschreibung: 'Seed Kurz',
      Langtext: 'Seed Langtext',
      Hersteller: 'Referenz Supplier',
      Verkaufspreis: 7.25,
      Einheit: ItemEinheit.Stk,
      Shopartikel: 0
    };

    persistItemWithinTransaction(referenceSeed);

    const preReference = selectReference.get('DB-REF-0002') as Record<string, unknown> | undefined;
    expect(preReference).toBeDefined();
    const preReferenceSnapshot = preReference ? { ...preReference } : null;

    persistItemWithinTransaction({
      ItemUUID: 'I-DB-NEW-0002',
      Artikel_Nummer: 'DB-REF-0002',
      BoxID: null,
      Location: null,
      UpdatedAt: new Date('2024-04-05T12:10:00Z'),
      Datum_erfasst: seedTimestamp,
      Auf_Lager: 1,
      Artikelbeschreibung: '',
      __skipReferencePersistence: true,
      __referenceRowOverride: {
        Artikel_Nummer: referenceSeed.Artikel_Nummer,
        Artikelbeschreibung: referenceSeed.Artikelbeschreibung,
        Kurzbeschreibung: referenceSeed.Kurzbeschreibung,
        Langtext: referenceSeed.Langtext,
        Hersteller: referenceSeed.Hersteller,
        Verkaufspreis: referenceSeed.Verkaufspreis,
        Einheit: referenceSeed.Einheit,
        Shopartikel: referenceSeed.Shopartikel
      }
    });

    const postReference = selectReference.get('DB-REF-0002') as Record<string, unknown> | undefined;
    expect(postReference).toEqual(preReferenceSnapshot);

    const newInstance = selectInstance.get('I-DB-NEW-0002') as { Artikel_Nummer: string | null } | undefined;
    expect(newInstance).toEqual({ Artikel_Nummer: 'DB-REF-0002' });
  });
});
