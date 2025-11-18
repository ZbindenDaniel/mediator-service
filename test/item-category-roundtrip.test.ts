import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingMessage, IncomingHttpHeaders, ServerResponse } from 'http';

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
const {
  db,
  persistItem,
  getItem,
  persistItemWithinTransaction,
  logEvent,
  getBox,
  listEventsForItem,
  getAgenticRun
} = require('../backend/persistence');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const saveItemAction = require('../backend/actions/save-item').default;

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

type JsonServerResponse = ServerResponse & { body: string; json: () => any };

function createJsonRequest(method: 'GET' | 'PUT', url: string, body?: unknown): IncomingMessage {
  const payload =
    body === undefined
      ? null
      : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  let delivered = false;
  const stream = new Readable({
    read() {
      if (!delivered && payload) {
        delivered = true;
        this.push(payload);
        return;
      }
      if (!delivered) {
        delivered = true;
      }
      this.push(null);
    }
  });
  const request = stream as unknown as IncomingMessage & { headers: IncomingHttpHeaders };
  request.method = method;
  request.url = url;
  request.headers = { 'content-type': 'application/json' };
  return request;
}

function createMockResponse(): JsonServerResponse {
  const store = {
    statusCode: 0,
    body: ''
  };
  const response = {
    writeHead(status: number) {
      store.statusCode = status;
      return response;
    },
    end(chunk?: any) {
      if (chunk) {
        store.body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      }
      return response;
    },
    json() {
      return store.body ? JSON.parse(store.body) : null;
    },
    get statusCode() {
      return store.statusCode;
    },
    set statusCode(value: number) {
      store.statusCode = value;
    },
    get body() {
      return store.body;
    }
  } as unknown as JsonServerResponse;
  return response;
}

function buildSaveItemContext() {
  return {
    db,
    persistItemWithinTransaction,
    logEvent,
    getItem,
    getBox,
    listEventsForItem,
    getAgenticRun
  };
}

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

describe('save-item API category normalisation', () => {
  test('returns numeric category codes after create and update', async () => {
    const itemId = 'I-HTTP-0001';
    const ctx = buildSaveItemContext();
    const createPayload = {
      actor: 'tester',
      Artikelbeschreibung: 'HTTP round-trip item',
      Artikel_Nummer: 'HTTP-ROUND-1',
      Hauptkategorien_A: 4001,
      Unterkategorien_A: 40011,
      Hauptkategorien_B: 5002,
      Unterkategorien_B: 50022,
      Einheit: ItemEinheit.Stk
    };

    const createReq = createJsonRequest('PUT', `/api/items/${encodeURIComponent(itemId)}`, createPayload);
    const createRes = createMockResponse();
    await saveItemAction.handle(createReq as any, createRes as any, ctx);
    expect(createRes.statusCode).toBe(200);

    const fetchAfterCreateRes = createMockResponse();
    await saveItemAction.handle(
      createJsonRequest('GET', `/api/items/${encodeURIComponent(itemId)}`) as any,
      fetchAfterCreateRes as any,
      ctx
    );
    expect(fetchAfterCreateRes.statusCode).toBe(200);
    const createdPayload = fetchAfterCreateRes.json();
    expect(createdPayload).toBeDefined();
    if (!createdPayload) {
      throw new Error('Fetch payload missing after create');
    }
    const createdItem = createdPayload.item;
    expect(createdItem).toBeDefined();
    expect(typeof createdItem.Hauptkategorien_A).toBe('number');
    expect(createdItem.Hauptkategorien_A).toBe(4001);
    expect(createdItem.Unterkategorien_A).toBe(40011);
    expect(createdItem.Hauptkategorien_B).toBe(5002);
    expect(createdItem.Unterkategorien_B).toBe(50022);

    const updateReq = createJsonRequest('PUT', `/api/items/${encodeURIComponent(itemId)}`, {
      actor: 'tester',
      Artikelbeschreibung: 'HTTP round-trip item (updated)'
    });
    const updateRes = createMockResponse();
    await saveItemAction.handle(updateReq as any, updateRes as any, ctx);
    expect(updateRes.statusCode).toBe(200);

    const fetchAfterUpdateRes = createMockResponse();
    await saveItemAction.handle(
      createJsonRequest('GET', `/api/items/${encodeURIComponent(itemId)}`) as any,
      fetchAfterUpdateRes as any,
      ctx
    );
    expect(fetchAfterUpdateRes.statusCode).toBe(200);
    const updatedPayload = fetchAfterUpdateRes.json();
    expect(updatedPayload).toBeDefined();
    if (!updatedPayload) {
      throw new Error('Fetch payload missing after update');
    }
    const updatedItem = updatedPayload.item;
    expect(updatedItem).toBeDefined();
    expect(updatedItem.Artikelbeschreibung).toBe('HTTP round-trip item (updated)');
    expect(updatedItem.Hauptkategorien_A).toBe(4001);
    expect(updatedItem.Unterkategorien_A).toBe(40011);
    expect(updatedItem.Hauptkategorien_B).toBe(5002);
    expect(updatedItem.Unterkategorien_B).toBe(50022);
    expect(typeof updatedItem.Hauptkategorien_A).toBe('number');
    expect(typeof updatedItem.Unterkategorien_A).toBe('number');
    expect(typeof updatedItem.Hauptkategorien_B).toBe('number');
    expect(typeof updatedItem.Unterkategorien_B).toBe('number');
  });
});
