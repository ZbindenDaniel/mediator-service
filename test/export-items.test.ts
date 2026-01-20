import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { parse as parseCsv } from 'csv-parse/sync';
import { ItemEinheit } from '../models';
import { MEDIA_DIR } from '../backend/lib/media';

// TODO(agent): Expand exporter/importer parity coverage as storage metadata requirements grow.
// TODO(export-items-mode): Add coverage for default mode behavior once export mode negotiation evolves.
const TEST_DB_FILE = path.join(__dirname, 'export-items.test.sqlite');
const ROUNDTRIP_CSV_FILE = path.join(__dirname, 'export-items-roundtrip.csv');
const ORIGINAL_DB_PATH = process.env.DB_PATH;
const EXPECTED_ITEMS_HEADER = [
  'Artikel-Nummer',
  'Artikeltyp',
  'CreatedAt',
  'Grafikname(n)',
  'Artikelbeschreibung',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge(mm)',
  'Breite(mm)',
  'Höhe(mm)',
  'Gewicht(kg)',
  'Verkaufspreis',
  'Auf Lager',
  'Veröffentlicht_Status',
  'Shopartikel',
  'Einheit',
  'EAN',
  'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
  'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
  'ItemUUID',
  'BoxID',
  'Location',
  'Label',
  'UpdatedAt'
];

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
const {
  db,
  listItemsForExport,
  logEvent,
  persistItemWithinTransaction,
  upsertBox
} = require('../backend/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const exportItems = require('../backend/actions/export-items').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ingestCsvFile } = require('../backend/importer');

type MockResponse = {
  status?: number;
  headers: Record<string, string>;
  body?: Buffer;
};

type ExportAction = typeof exportItems;

type ExportContext = {
  db: typeof db;
  listItemsForExport: typeof listItemsForExport;
  logEvent: typeof logEvent;
};

function serializeCsvLine(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) {
        return '';
      }
      const normalized = String(value);
      return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
    })
    .join(',');
}

function clearDatabase(): void {
  try {
    db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM shopware_sync_queue; DELETE FROM label_queue;');
  } catch (error) {
    console.error('[export-items.test] Failed to clear database', error);
    throw error;
  }
}

function mockRequest(pathname: string): Readable {
  const request = new Readable({
    read() {
      this.push(null);
    }
  });
  (request as any).url = pathname;
  (request as any).method = 'GET';
  return request;
}

function runAction(action: ExportAction, req: Readable, ctx: ExportContext): Promise<MockResponse> {
  return new Promise((resolve, reject) => {
    const response: MockResponse & {
      writeHead: (status: number, headers: Record<string, string>) => void;
      end: (chunk?: any) => void;
    } = {
      headers: {},
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(chunk) {
        if (chunk !== undefined) {
          this.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        }
        resolve(this);
      }
    };

    try {
      const maybePromise = action.handle(req as any, response as any, ctx);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((error: unknown) => {
          console.error('[export-items.test] Export action rejected', error);
          reject(error);
        });
      }
    } catch (error) {
      console.error('[export-items.test] Export action threw synchronously', error);
      reject(error);
    }
  });
}

describe('export-items action', () => {
  beforeEach(() => {
    clearDatabase();
    if (fs.existsSync(ROUNDTRIP_CSV_FILE)) {
      fs.rmSync(ROUNDTRIP_CSV_FILE, { force: true });
    }
  });

  afterAll(() => {
    try {
      db.close();
    } catch (error) {
      console.warn('[export-items.test] Failed to close database cleanly', error);
    }
    removeTestDatabase();
    if (fs.existsSync(ROUNDTRIP_CSV_FILE)) {
      fs.rmSync(ROUNDTRIP_CSV_FILE, { force: true });
    }
    if (ORIGINAL_DB_PATH === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = ORIGINAL_DB_PATH;
    }
  });

  test('appends metadata columns so importer round-trips retain placement context', async () => {
    const now = new Date('2024-07-01T10:00:00.000Z');
    const placement = {
      BoxID: 'B-EXPORT-001',
      LocationId: 'LOC-01',
      Label: 'LOC-01'
    };

    upsertBox.run({
      BoxID: placement.BoxID,
      LocationId: placement.LocationId,
      Label: placement.Label,
      CreatedAt: now.toISOString(),
      Notes: '',
      PhotoPath: null,
      PlacedBy: 'tester',
      PlacedAt: now.toISOString(),
      UpdatedAt: now.toISOString()
    });

    persistItemWithinTransaction({
      ItemUUID: 'I-EXPORT-METADATA-001',
      Artikel_Nummer: 'EXPORT-01',
      BoxID: placement.BoxID,
      Location: placement.LocationId,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 1,
      Langtext: ''
    });

    const response = await runAction(
      exportItems,
      mockRequest('/api/export/items?actor=tester'),
      { db, listItemsForExport, logEvent }
    );

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/csv');

    const lines = response.body?.toString('utf8').trim().split('\n') ?? [];
    expect(lines.length).toBeGreaterThan(1);

    const headerColumns = lines[0].split(',');
    expect(headerColumns).toEqual(EXPECTED_ITEMS_HEADER);

    const headerIndex: Record<string, number> = {};
    headerColumns.forEach((header, index) => {
      headerIndex[header] = index;
    });

    const rowColumns = lines[1].split(',');
    expect(rowColumns[headerIndex.ItemUUID]).toBe('I-EXPORT-METADATA-001');
    expect(rowColumns[headerIndex.BoxID]).toBe(placement.BoxID);
    expect(rowColumns[headerIndex.Location]).toBe(placement.LocationId);
    expect(rowColumns[headerIndex.Label]).toBe(placement.Label);
    expect(rowColumns[headerIndex.UpdatedAt]).toBe(now.toISOString());
  });

  test('mode=erp groups rows and omits ItemUUID column', async () => {
    const now = new Date('2024-07-02T10:00:00.000Z');
    const placement = {
      BoxID: 'B-ERP-001',
      LocationId: 'LOC-ERP-01',
      Label: 'LOC-ERP-01'
    };

    upsertBox.run({
      BoxID: placement.BoxID,
      LocationId: placement.LocationId,
      Label: placement.Label,
      CreatedAt: now.toISOString(),
      Notes: '',
      PhotoPath: null,
      PlacedBy: 'tester',
      PlacedAt: now.toISOString(),
      UpdatedAt: now.toISOString()
    });

    persistItemWithinTransaction({
      ItemUUID: 'I-ERP-001',
      Artikel_Nummer: 'ERP-01',
      BoxID: placement.BoxID,
      Location: placement.LocationId,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 1,
      Quality: 2,
      Langtext: ''
    });

    persistItemWithinTransaction({
      ItemUUID: 'I-ERP-002',
      Artikel_Nummer: 'ERP-01',
      BoxID: placement.BoxID,
      Location: placement.LocationId,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 2,
      Quality: 2,
      Langtext: ''
    });

    const response = await runAction(
      exportItems,
      mockRequest('/api/export/items?actor=tester&mode=erp'),
      { db, listItemsForExport, logEvent }
    );

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/csv');

    const csvPayload = (response.body as Buffer).toString('utf8');
    const parsedRows = parseCsv(csvPayload, { skip_empty_lines: true });
    expect(parsedRows.length).toBe(2);

    const headerColumns = parsedRows[0].map((value: unknown) => (value === null || value === undefined ? '' : String(value)));
    expect(headerColumns).not.toContain('ItemUUID');

    const dataColumns = parsedRows[1].map((value: unknown) => (value === null || value === undefined ? '' : String(value)));
    const onHandIndex = headerColumns.indexOf('Auf Lager');
    expect(onHandIndex).toBeGreaterThan(-1);
    expect(Number(dataColumns[onHandIndex])).toBe(3);
  });

  // TODO(agent): Broaden round-trip assertions to cover Langtext payload objects once exporters emit structured content.
  test('partner CSV exports can be re-imported without losing descriptive metadata', async () => {
    const now = new Date('2024-08-01T12:00:00.000Z');
    const identifierDateSegment = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getFullYear() % 100
    ).padStart(2, '0')}`;
    const expectedItemUUID = `I-${identifierDateSegment}-0001`;
    const seedItem = {
      ItemUUID: expectedItemUUID,
      Artikel_Nummer: 'ROUNDTRIP-001',
      Artikelbeschreibung: 'Roundtrip description survives export/import cycles.',
      Kurzbeschreibung: 'Short detail',
      Langtext: { Details: 'Detailed Langtext block' },
      Hersteller: 'Roundtrip Manufacturing',
      Grafikname: 'roundtrip.png',
      BoxID: null,
      Location: null,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 7,
      Quality: 4,
      Verkaufspreis: 199.95,
      Länge_mm: 123,
      Breite_mm: 45,
      Höhe_mm: 67,
      Gewicht_kg: 3.4,
      Hauptkategorien_A: 101,
      Unterkategorien_A: 202,
      Hauptkategorien_B: 303,
      Unterkategorien_B: 404,
      Veröffentlicht_Status: 'yes',
      Shopartikel: 1,
      Artikeltyp: 'STANDARD',
      Einheit: ItemEinheit.Stk,
    };

    persistItemWithinTransaction(seedItem);

    const response = await runAction(
      exportItems,
      mockRequest('/api/export/items?actor=tester'),
      { db, listItemsForExport, logEvent }
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Buffer);

    const csvPayload = (response.body as Buffer).toString('utf8');
    const parsedRows = parseCsv(csvPayload, { skip_empty_lines: true });
    expect(parsedRows.length).toBeGreaterThan(1);
    const headerColumns = parsedRows[0].map((value: unknown) => (value === null || value === undefined ? '' : String(value)));
    expect(headerColumns).toEqual(EXPECTED_ITEMS_HEADER);
    const dataColumns = parsedRows[1].map((value: unknown) => (value === null || value === undefined ? '' : String(value)));
    const entrydateIndex = headerColumns.indexOf('CreatedAt');
    expect(entrydateIndex).toBeGreaterThan(-1);
    headerColumns[entrydateIndex] = 'entry_date';
    const itemUUIDIndex = headerColumns.indexOf('ItemUUID');
    expect(itemUUIDIndex).toBeGreaterThan(-1);
    dataColumns[itemUUIDIndex] = '';
    // TODO(agent): Extend identifier date alias regression once multi-row CSV fixtures cover BoxID remapping determinism.
    const mutatedCsv = [serializeCsvLine(headerColumns), serializeCsvLine(dataColumns)].join('\n');

    fs.writeFileSync(ROUNDTRIP_CSV_FILE, `${mutatedCsv}\n`);

    clearDatabase();

    const ingestionResult = await ingestCsvFile(ROUNDTRIP_CSV_FILE);
    expect(ingestionResult.count).toBe(1);

    const roundtrippedRows = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    expect(roundtrippedRows).toHaveLength(1);
    const roundtripped = roundtrippedRows[0];

    expect(roundtripped.Artikel_Nummer).toBe(seedItem.Artikel_Nummer);
    expect(roundtripped.Artikelbeschreibung).toBe(seedItem.Artikelbeschreibung);
    expect(roundtripped.Kurzbeschreibung).toBe(seedItem.Kurzbeschreibung);
    expect(roundtripped.Langtext).toEqual({ Details: 'Detailed Langtext block' });
    expect(roundtripped.Hersteller).toBe(seedItem.Hersteller);
    expect(roundtripped.Länge_mm).toBe(seedItem.Länge_mm);
    expect(roundtripped.Breite_mm).toBe(seedItem.Breite_mm);
    expect(roundtripped.Höhe_mm).toBe(seedItem.Höhe_mm);
    expect(roundtripped.Gewicht_kg).toBe(seedItem.Gewicht_kg);
    expect(roundtripped.Verkaufspreis).toBe(seedItem.Verkaufspreis);
    expect(roundtripped.Quality).toBe(seedItem.Quality);
    expect(roundtripped.Hauptkategorien_A).toBe(seedItem.Hauptkategorien_A);
    expect(roundtripped.Unterkategorien_A).toBe(seedItem.Unterkategorien_A);
    expect(roundtripped.Hauptkategorien_B).toBe(seedItem.Hauptkategorien_B);
    expect(roundtripped.Unterkategorien_B).toBe(seedItem.Unterkategorien_B);
    expect(roundtripped.Einheit).toBe(seedItem.Einheit);
    expect(roundtripped.Shopartikel).toBe(seedItem.Shopartikel);
    expect(roundtripped.ItemUUID).toBe(expectedItemUUID);
    const importedDatumErfasstRaw = roundtripped.Datum_erfasst as Date | string | null | undefined;
    expect(importedDatumErfasstRaw).toBeTruthy();
    const importedDatumErfasstIso =
      importedDatumErfasstRaw instanceof Date
        ? importedDatumErfasstRaw.toISOString()
        : new Date(importedDatumErfasstRaw as string).toISOString();
    expect(importedDatumErfasstIso).toBe(now.toISOString());
  });

  // TODO(agent): Add multi-image exporter fixtures for items that mix remote and local media paths.
  test('image_names column enumerates stored media assets when multiple files exist', async () => {
    const now = new Date('2024-09-01T09:00:00.000Z');
    const itemUUID = 'I-EXPORT-MEDIA-001';
    const artikelNummer = 'EXPORT-MEDIA-001';
    const grafikname = `/media/${itemUUID}/primary.jpg`;
    const mediaDir = path.join(MEDIA_DIR, itemUUID);
    const mediaFiles = ['primary.jpg', 'detail-01.png'];

    persistItemWithinTransaction({
      ItemUUID: itemUUID,
      Artikel_Nummer: artikelNummer,
      Grafikname: grafikname,
      Artikelbeschreibung: 'Media enumeration test',
      Kurzbeschreibung: 'Media short',
      Langtext: 'Media long',
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 2
    });

    fs.mkdirSync(mediaDir, { recursive: true });
    for (const file of mediaFiles) {
      fs.writeFileSync(path.join(mediaDir, file), 'fixture');
    }

    try {
      const response = await runAction(
        exportItems,
        mockRequest('/api/export/items?actor=tester'),
        { db, listItemsForExport, logEvent }
      );

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Buffer);

      const csvPayload = (response.body as Buffer).toString('utf8').trim();
      const csvLines = csvPayload.split(/\r?\n/);
      expect(csvLines).toHaveLength(2);

      const headerColumns = csvLines[0].split(',');
      const dataColumns = csvLines[1].split(',');
      const imageNamesIndex = headerColumns.indexOf('Grafikname(n)');
      expect(imageNamesIndex).toBeGreaterThan(-1);

      const imageNamesCell = dataColumns[imageNamesIndex];
      const expectedAssets = mediaFiles.map((file) => `/media/${itemUUID}/${file}`);
      expect(imageNamesCell.split('|')).toEqual(expectedAssets);
    } finally {
      if (fs.existsSync(mediaDir)) {
        fs.rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  test('image_names column excludes non-image assets when media directories are mixed', async () => {
    const now = new Date('2024-10-01T12:00:00.000Z');
    const itemUUID = 'I-EXPORT-MEDIA-HTML-001';
    const artikelNummer = 'EXPORT-MEDIA-HTML-001';
    const grafikname = `/media/${itemUUID}/primary.jpg`;
    const mediaDir = path.join(MEDIA_DIR, itemUUID);
    const mediaFiles = ['detail-01.png', 'primary.jpg'];
    const htmlFiles = ['index.htm', 'readme.html'];
    const otherNonMediaFiles = ['manual.pdf', 'notes.txt'];

    persistItemWithinTransaction({
      ItemUUID: itemUUID,
      Artikel_Nummer: artikelNummer,
      Grafikname: grafikname,
      Artikelbeschreibung: 'Mixed media directory export test',
      Kurzbeschreibung: 'Mixed media short',
      Langtext: 'Mixed media long',
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 3
    });

    fs.mkdirSync(mediaDir, { recursive: true });
    for (const file of [...mediaFiles, ...htmlFiles, ...otherNonMediaFiles]) {
      fs.writeFileSync(path.join(mediaDir, file), 'fixture');
    }

    try {
      const response = await runAction(
        exportItems,
        mockRequest('/api/export/items?actor=tester'),
        { db, listItemsForExport, logEvent }
      );

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Buffer);

      const csvPayload = (response.body as Buffer).toString('utf8').trim();
      const csvLines = csvPayload.split(/\r?\n/);
      expect(csvLines).toHaveLength(2);

      const headerColumns = csvLines[0].split(',');
      const dataColumns = csvLines[1].split(',');
      const imageNamesIndex = headerColumns.indexOf('Grafikname(n)');
      expect(imageNamesIndex).toBeGreaterThan(-1);

      const imageNamesCell = dataColumns[imageNamesIndex];
      const expectedAssets = mediaFiles.map((file) => `/media/${itemUUID}/${file}`);
      expect(imageNamesCell.split('|')).toEqual(expectedAssets);
    } finally {
      if (fs.existsSync(mediaDir)) {
        fs.rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });
});
