import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { ItemEinheit } from '../models';

// TODO(agent): Expand exporter/importer parity coverage as storage metadata requirements grow.
const TEST_DB_FILE = path.join(__dirname, 'export-items.test.sqlite');
const ROUNDTRIP_CSV_FILE = path.join(__dirname, 'export-items-roundtrip.csv');
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
      Location: 'LOC-01'
    };

    upsertBox.run({
      BoxID: placement.BoxID,
      Location: placement.Location,
      StandortLabel: placement.Location,
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
      Location: placement.Location,
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
    expect(headerColumns.slice(-4)).toEqual(['itemUUID', 'BoxID', 'Location', 'UpdatedAt']);

    const rowColumns = lines[1].split(',');
    expect(rowColumns.slice(-4)).toEqual([
      'I-EXPORT-METADATA-001',
      placement.BoxID,
      placement.Location,
      now.toISOString()
    ]);
  });

  // TODO(agent): Broaden round-trip assertions to cover Langtext payload objects once exporters emit structured content.
  test('partner CSV exports can be re-imported without losing descriptive metadata', async () => {
    const now = new Date('2024-08-01T12:00:00.000Z');
    const seedItem = {
      ItemUUID: 'I-ROUNDTRIP-0001',
      Artikel_Nummer: 'ROUNDTRIP-001',
      Artikelbeschreibung: 'Roundtrip description survives export/import cycles.',
      Kurzbeschreibung: 'Short detail',
      Langtext: 'Detailed Langtext block',
      Hersteller: 'Roundtrip Manufacturing',
      Grafikname: 'roundtrip.png',
      BoxID: null,
      Location: null,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 7,
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

    fs.writeFileSync(ROUNDTRIP_CSV_FILE, response.body as Buffer);

    clearDatabase();

    const ingestionResult = await ingestCsvFile(ROUNDTRIP_CSV_FILE);
    expect(ingestionResult.count).toBe(1);

    const roundtrippedRows = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    expect(roundtrippedRows).toHaveLength(1);
    const roundtripped = roundtrippedRows[0];

    expect(roundtripped.Artikel_Nummer).toBe(seedItem.Artikel_Nummer);
    expect(roundtripped.Artikelbeschreibung).toBe(seedItem.Artikelbeschreibung);
    expect(roundtripped.Kurzbeschreibung).toBe(seedItem.Kurzbeschreibung);
    expect(roundtripped.Langtext).toBe(seedItem.Langtext);
    expect(roundtripped.Hersteller).toBe(seedItem.Hersteller);
    expect(roundtripped.Länge_mm).toBe(seedItem.Länge_mm);
    expect(roundtripped.Breite_mm).toBe(seedItem.Breite_mm);
    expect(roundtripped.Höhe_mm).toBe(seedItem.Höhe_mm);
    expect(roundtripped.Gewicht_kg).toBe(seedItem.Gewicht_kg);
    expect(roundtripped.Verkaufspreis).toBe(seedItem.Verkaufspreis);
    expect(roundtripped.Hauptkategorien_A).toBe(seedItem.Hauptkategorien_A);
    expect(roundtripped.Unterkategorien_A).toBe(seedItem.Unterkategorien_A);
    expect(roundtripped.Hauptkategorien_B).toBe(seedItem.Hauptkategorien_B);
    expect(roundtripped.Unterkategorien_B).toBe(seedItem.Unterkategorien_B);
    expect(roundtripped.Einheit).toBe(seedItem.Einheit);
    expect(roundtripped.Shopartikel).toBe(seedItem.Shopartikel);
  });
});
