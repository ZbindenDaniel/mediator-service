import fs from 'fs';
import path from 'path';
import { MEDIA_DIR } from '../backend/lib/media';

const TEST_DB_FILE = path.join(__dirname, 'csv-ingest-kivitendo-schema.test.sqlite');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'csv-kivitendo-schema');
const KIVITENDO_INITIAL = path.join(FIXTURE_DIR, 'kivitendo-initial.csv');
const KIVITENDO_UPDATE = path.join(FIXTURE_DIR, 'kivitendo-update.csv');
const KIVITENDO_ZERO_QUANTITY = path.join(FIXTURE_DIR, 'kivitendo-zero-quantity.csv');
const KIVITENDO_RELAXED = path.join(FIXTURE_DIR, 'kivitendo-relaxed.csv');
// TODO(agent): Extend relaxed fixtures for future timestamp variants surfaced by partners.
const KIVITENDO_RELAXED_UPDATE = path.join(FIXTURE_DIR, 'kivitendo-relaxed-update.csv');
// TODO(agent): Replace insertdate-only fixture when upstream CSVs emit normalized Datum erfasst columns by default.
const KIVITENDO_INSERTDATE_ONLY = path.join(FIXTURE_DIR, 'kivitendo-insertdate-only.csv');
const KIVITENDO_MISSING_ARTIKELNUMMER = path.join(
  FIXTURE_DIR,
  'kivitendo-missing-artikelnummer.csv'
);
// TODO(agent): Track exporter fallback coverage for ImageNames until media uploads are ubiquitous.
const KIVITENDO_MULTI_IMAGE = path.join(FIXTURE_DIR, 'kivitendo-multi-images.csv');

// TODO: Expand fixtures when additional Kivitendo header permutations surface.
// TODO(agent): Mirror new Kivitendo cvar metadata in fixtures as upstream exports evolve.

const ORIGINAL_DB_PATH = process.env.DB_PATH;

function removeTestDatabase() {
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
const { db, listItemsForExport } = require('../backend/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveExportValue } = require('../backend/actions/export-items');

const selectItemByArtikel = db.prepare(
  'SELECT ItemUUID, Artikel_Nummer as ArtikelNummer, BoxID, Auf_Lager as AufLager FROM items WHERE Artikel_Nummer = ?'
);
type ItemRefRow = {
  Grafikname: string | null;
  ImageNames: string | null;
  Artikelbeschreibung: string | null;
  Langtext: string | null;
  Verkaufspreis: number | null;
  GewichtKg: number | null;
  Einheit: string | null;
  VStatus: string | null;
  Shopartikel: number | null;
  Kurzbeschreibung: string | null;
  Hersteller: string | null;
  LaengeMm: number | null;
  BreiteMm: number | null;
  HoeheMm: number | null;
  HauptA: number | null;
  UnterA: number | null;
  HauptB: number | null;
  UnterB: number | null;
};

const selectItemRef = db.prepare(
  `SELECT
    Grafikname,
    ImageNames,
    Artikelbeschreibung,
    Langtext,
    Verkaufspreis,
    Gewicht_kg as GewichtKg,
    Einheit,
    Veröffentlicht_Status as VStatus,
    Shopartikel,
    Kurzbeschreibung,
    Hersteller,
    Länge_mm as LaengeMm,
    Breite_mm as BreiteMm,
    Höhe_mm as HoeheMm,
    CAST(Hauptkategorien_A AS INTEGER) as HauptA,
    CAST(Unterkategorien_A AS INTEGER) as UnterA,
    CAST(Hauptkategorien_B AS INTEGER) as HauptB,
    CAST(Unterkategorien_B AS INTEGER) as UnterB
  FROM item_refs
  WHERE Artikel_Nummer = ?`
);
const selectBox = db.prepare('SELECT BoxID, Notes FROM boxes WHERE BoxID = ?');
const selectItemDatum = db.prepare('SELECT Datum_erfasst as DatumErfasst FROM items WHERE Artikel_Nummer = ?');

function clearDatabase() {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[csv-ingest-kivitendo-schema.test] Failed to clear database', error);
    throw error;
  }
}

function cleanupMediaDirectory(itemUUID: string | null | undefined): void {
  if (!itemUUID) {
    return;
  }
  const candidate = path.join(MEDIA_DIR, itemUUID);
  if (fs.existsSync(candidate)) {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}

beforeEach(() => {
  clearDatabase();
});

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[csv-ingest-kivitendo-schema.test] Failed to close database cleanly', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

describe('CSV ingestion Kivitendo schema compatibility', () => {
  test('maps and updates rows on re-import', async () => {
    let initialResult: { count: number; boxes: string[] };
    try {
      initialResult = await ingestCsvFile(KIVITENDO_INITIAL);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Initial ingestion failed', error);
      throw error;
    }

    expect(initialResult.count).toBe(1);
    expect(initialResult.boxes).toEqual(['B-010424-0001']);

    const initialItem = selectItemByArtikel.get('KIV-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(initialItem).toEqual({
      ItemUUID: 'kivitendo-101',
      ArtikelNummer: 'KIV-001',
      BoxID: 'B-010424-0001',
      AufLager: 5,
    });

    const initialRef = selectItemRef.get('KIV-001') as ItemRefRow | undefined;
    expect(initialRef).toEqual({
      Grafikname: 'kivi-image.png',
      ImageNames: 'kivi-image.png|thumb',
      Artikelbeschreibung: 'Kivitendo Artikel',
      Langtext: 'Langtext Aus Custom Feld',
      Verkaufspreis: 17.49,
      GewichtKg: 1.25,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
      Kurzbeschreibung: 'Kurzbeschreibung Initial',
      Hersteller: 'Hersteller GmbH',
      LaengeMm: 250,
      BreiteMm: 150,
      HoeheMm: 80,
      HauptA: 1001,
      UnterA: 2001,
      HauptB: 3001,
      UnterB: 4001,
    });

    const initialBox = selectBox.get('B-010424-0001') as { BoxID: string; Notes: string | null } | undefined;
    expect(initialBox).toEqual({ BoxID: 'B-010424-0001', Notes: '' });

    let updateResult: { count: number; boxes: string[] };
    try {
      updateResult = await ingestCsvFile(KIVITENDO_UPDATE);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Update ingestion failed', error);
      throw error;
    }

    expect(updateResult.count).toBe(1);
    expect(updateResult.boxes).toEqual(['B-010424-0001']);

    const updatedItem = selectItemByArtikel.get('KIV-001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(updatedItem).toEqual({
      ItemUUID: 'kivitendo-101',
      ArtikelNummer: 'KIV-001',
      BoxID: 'B-010424-0001',
      AufLager: 8,
    });

    const updatedRef = selectItemRef.get('KIV-001') as ItemRefRow | undefined;
    expect(updatedRef).toEqual({
      Grafikname: 'kivi-image-updated.jpg',
      ImageNames: 'kivi-image-updated.jpg|variant',
      Artikelbeschreibung: 'Kivitendo Artikel Aktualisiert',
      Langtext: 'Langtext Aus Custom Feld Update',
      Verkaufspreis: 18.25,
      GewichtKg: 1.3,
      Einheit: 'Stk',
      VStatus: 'no',
      Shopartikel: 0,
      Kurzbeschreibung: 'Kurzbeschreibung Update',
      Hersteller: 'Hersteller GmbH Updated',
      LaengeMm: 275,
      BreiteMm: 165,
      HoeheMm: 90,
      HauptA: 1101,
      UnterA: 2101,
      HauptB: 3101,
      UnterB: 4101,
    });

    const updatedBox = selectBox.get('B-010424-0001') as { BoxID: string; Notes: string | null } | undefined;
    expect(updatedBox).toEqual({ BoxID: 'B-010424-0001', Notes: '' });
  });

  test('skips zero quantity rows but persists references', async () => {
    let result: { count: number; boxes: string[] };
    try {
      result = await ingestCsvFile(KIVITENDO_ZERO_QUANTITY);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Zero quantity ingestion failed', error);
      throw error;
    }

    expect(result.count).toBe(0);
    expect(result.boxes).toEqual([]);

    const zeroItem = selectItemByArtikel.get('KIV-002') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(zeroItem).toBeUndefined();

    const zeroRef = selectItemRef.get('KIV-002') as ItemRefRow | undefined;
    expect(zeroRef).toEqual({
      Grafikname: 'kivi-image-zero.jpg',
      ImageNames: 'kivi-image-zero.jpg|thumb',
      Artikelbeschreibung: 'Kivitendo Nullbestand',
      Langtext: 'Langtext Nullbestand',
      Verkaufspreis: 8.49,
      GewichtKg: 0.75,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 0,
      Kurzbeschreibung: 'Kurzbeschreibung Null',
      Hersteller: 'Null Hersteller',
      LaengeMm: 120,
      BreiteMm: 60,
      HoeheMm: 40,
      HauptA: 5001,
      UnterA: 6001,
      HauptB: 7001,
      UnterB: 8001,
    });
  });

  test('ingests relaxed header variant with insertdate fallback', async () => {
    let result: { count: number; boxes: string[] };
    try {
      result = await ingestCsvFile(KIVITENDO_RELAXED);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Relaxed variant ingestion failed', error);
      throw error;
    }

    expect(result.count).toBe(1);
    expect(result.boxes).toEqual(['B-030424-0001']);

    const relaxedItem = selectItemByArtikel.get('KIV-RELAX') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(relaxedItem).toEqual({
      ItemUUID: 'kivitendo-202',
      ArtikelNummer: 'KIV-RELAX',
      BoxID: 'B-030424-0001',
      AufLager: 4,
    });

    const relaxedRef = selectItemRef.get('KIV-RELAX') as ItemRefRow | undefined;
    expect(relaxedRef).toEqual({
      Grafikname: 'kivi-relaxed.jpg',
      ImageNames: 'kivi-relaxed.jpg',
      Artikelbeschreibung: 'Kivitendo Relaxed Export',
      Langtext: 'Relaxed Langtext',
      Verkaufspreis: 0,
      GewichtKg: 0.55,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
      Kurzbeschreibung: 'Relaxed Kurz',
      Hersteller: 'Relaxed Maker',
      LaengeMm: 210,
      BreiteMm: 120,
      HoeheMm: 70,
      HauptA: 7100,
      UnterA: 7200,
      HauptB: 7300,
      UnterB: 7400,
    });

    const relaxedBox = selectBox.get('B-030424-0001') as { BoxID: string; Notes: string | null } | undefined;
    expect(relaxedBox).toEqual({ BoxID: 'B-030424-0001', Notes: '' });
  });

  test('maintains deterministic identifiers when only insertdate is provided across re-imports', async () => {
    let initialResult: { count: number; boxes: string[] };
    try {
      initialResult = await ingestCsvFile(KIVITENDO_RELAXED);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Relaxed baseline ingestion failed', error);
      throw error;
    }

    expect(initialResult.count).toBe(1);
    expect(initialResult.boxes).toEqual(['B-030424-0001']);

    const relaxedItem = selectItemByArtikel.get('KIV-RELAX') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(relaxedItem).toEqual({
      ItemUUID: 'kivitendo-202',
      ArtikelNummer: 'KIV-RELAX',
      BoxID: 'B-030424-0001',
      AufLager: 4,
    });

    let updateResult: { count: number; boxes: string[] };
    try {
      updateResult = await ingestCsvFile(KIVITENDO_RELAXED_UPDATE);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Relaxed update ingestion failed', error);
      throw error;
    }

    expect(updateResult.count).toBe(1);
    expect(updateResult.boxes).toEqual(['B-030424-0001']);

    const relaxedUpdatedItem = selectItemByArtikel.get('KIV-RELAX') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(relaxedUpdatedItem).toEqual({
      ItemUUID: 'kivitendo-202',
      ArtikelNummer: 'KIV-RELAX',
      BoxID: 'B-030424-0001',
      AufLager: 6,
    });

    const relaxedUpdatedRef = selectItemRef.get('KIV-RELAX') as ItemRefRow | undefined;
    expect(relaxedUpdatedRef).toEqual({
      Grafikname: 'kivi-relaxed-update.jpg',
      ImageNames: 'kivi-relaxed-update.jpg',
      Artikelbeschreibung: 'Kivitendo Relaxed Export Update',
      Langtext: 'Relaxed Langtext Update',
      Verkaufspreis: 0,
      GewichtKg: 0.6,
      Einheit: 'Stk',
      VStatus: 'no',
      Shopartikel: 0,
      Kurzbeschreibung: 'Relaxed Kurz Update',
      Hersteller: 'Relaxed Maker Update',
      LaengeMm: 230,
      BreiteMm: 140,
      HoeheMm: 85,
      HauptA: 8100,
      UnterA: 8200,
      HauptB: 8300,
      UnterB: 8400,
    });

    const relaxedUpdatedBox = selectBox.get('B-030424-0001') as { BoxID: string; Notes: string | null } | undefined;
    expect(relaxedUpdatedBox).toEqual({ BoxID: 'B-030424-0001', Notes: '' });
  });

  // TODO(agent): Extend missing Artikelnummer coverage to multi-row CSVs when concurrency requirements surface.
  test('mints Artikelnummer when CSV row omits identifier', async () => {
    let missingResult: { count: number; boxes: string[] };
    try {
      missingResult = await ingestCsvFile(KIVITENDO_MISSING_ARTIKELNUMMER);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Missing identifier ingestion failed', error);
      throw error;
    }

    expect(missingResult.count).toBe(1);
    expect(missingResult.boxes).toEqual(['B-010524-0001']);

    const mintedItem = selectItemByArtikel.get('00001') as
      | { ItemUUID: string; ArtikelNummer: string | null; BoxID: string | null; AufLager: number | null }
      | undefined;
    expect(mintedItem).toEqual({
      ItemUUID: 'kivitendo-201',
      ArtikelNummer: '00001',
      BoxID: 'B-010524-0001',
      AufLager: 3,
    });

    const mintedRef = selectItemRef.get('00001') as ItemRefRow | undefined;
    expect(mintedRef).toEqual({
      Grafikname: 'missing-image.png',
      ImageNames: 'missing-image.png|thumb',
      Artikelbeschreibung: 'Ohne Artikelnummer',
      Langtext: 'Langtext Ohne Artikelnummer',
      Verkaufspreis: 9.49,
      GewichtKg: 0.75,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
      Kurzbeschreibung: 'Kurzbeschreibung Ohne Nummer',
      Hersteller: 'Herstellerin GmbH',
      LaengeMm: 150,
      BreiteMm: 120,
      HoeheMm: 45,
      HauptA: 2001,
      UnterA: 2101,
      HauptB: 2201,
      UnterB: 2301,
    });
  });

  test('hydrates Datum_erfasst from insertdate alias when normalized column is missing', async () => {
    try {
      await ingestCsvFile(KIVITENDO_INSERTDATE_ONLY);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Insertdate-only ingestion failed', error);
      throw error;
    }

    const datumRow = selectItemDatum.get('KIV-INSERT') as { DatumErfasst: string | null } | undefined;
    expect(datumRow).toEqual({ DatumErfasst: '2024-04-08T11:30:00.000Z' });
  });

  test('persists multi-image metadata and exporter fallback', async () => {
    try {
      await ingestCsvFile(KIVITENDO_MULTI_IMAGE);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Multi-image ingestion failed', error);
      throw error;
    }

    const multiRef = selectItemRef.get('KIV-MULTI') as ItemRefRow | undefined;
    expect(multiRef).toEqual({
      Grafikname: 'multi-image-primary.png',
      ImageNames: 'multi-image-primary.png|multi-image-secondary.jpg',
      Artikelbeschreibung: 'Multi image article',
      Langtext: 'Multi image description',
      Verkaufspreis: 22.5,
      GewichtKg: 0.5,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
      Kurzbeschreibung: 'Multi short text',
      Hersteller: 'Multi Manufacturer',
      LaengeMm: 125,
      BreiteMm: 95,
      HoeheMm: 45,
      HauptA: 2101,
      UnterA: 2201,
      HauptB: 2301,
      UnterB: 2401,
    });

    const exportRows = listItemsForExport.all({ createdAfter: null, updatedAfter: null }) as Array<
      Record<string, unknown>
    >;
    const multiRow = exportRows.find((row) => row.Artikel_Nummer === 'KIV-MULTI');
    expect(multiRow).toBeTruthy();
    const itemUUID = (multiRow?.ItemUUID as string | undefined) ?? null;
    cleanupMediaDirectory(itemUUID);
    const resolved = resolveExportValue('image_names', multiRow as Record<string, unknown>);
    expect(resolved).toBe('multi-image-primary.png|multi-image-secondary.jpg');
  });
});

  test('persists multi-image metadata and exporter fallback', async () => {
    try {
      await ingestCsvFile(KIVITENDO_MULTI_IMAGE);
    } catch (error) {
      console.error('[csv-ingest-kivitendo-schema.test] Multi-image ingestion failed', error);
      throw error;
    }

    const multiRef = selectItemRef.get('KIV-MULTI') as ItemRefRow | undefined;
    expect(multiRef).toEqual({
      Grafikname: 'multi-image-primary.png',
      ImageNames: 'multi-image-primary.png|multi-image-secondary.jpg',
      Artikelbeschreibung: 'Multi image article',
      Langtext: 'Multi image description',
      Verkaufspreis: 22.5,
      GewichtKg: 0.5,
      Einheit: 'Stk',
      VStatus: 'yes',
      Shopartikel: 1,
      Kurzbeschreibung: 'Multi short text',
      Hersteller: 'Multi Manufacturer',
      LaengeMm: 125,
      BreiteMm: 95,
      HoeheMm: 45,
      HauptA: 2101,
      UnterA: 2201,
      HauptB: 2301,
      UnterB: 2401,
    });

    const exportRows = listItemsForExport.all({ createdAfter: null, updatedAfter: null }) as Array<
      Record<string, unknown>
    >;
    const multiRow = exportRows.find((row) => row.Artikel_Nummer === 'KIV-MULTI');
    expect(multiRow).toBeTruthy();
    const itemUUID = (multiRow?.ItemUUID as string | undefined) ?? null;
    cleanupMediaDirectory(itemUUID);
    const resolved = resolveExportValue('image_names', multiRow as Record<string, unknown>);
    expect(resolved).toBe('multi-image-primary.png|multi-image-secondary.jpg');
  });
