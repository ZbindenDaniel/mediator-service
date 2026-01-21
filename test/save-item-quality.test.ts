import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';


const TEST_DB_FILE = path.join(__dirname, 'save-item-quality.sqlite');
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
  persistItemWithinTransaction,
  logEvent,
  getItem,
  getBox,
  listEventsForItem,
  getAgenticRun,
  enqueueShopwareSyncJob
} = require('../backend/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const saveItemAction = require('../backend/actions/save-item').default;

const selectReference = db.prepare('SELECT Quality, Shopartikel FROM item_refs WHERE Artikel_Nummer = ?');

function clearDatabase(): void {
  db.exec('DELETE FROM events; DELETE FROM item_refs; DELETE FROM items; DELETE FROM boxes; DELETE FROM label_queue; DELETE FROM shopware_sync_queue;');
}

type JsonServerResponse = ServerResponse & { body: string; json: () => any };

function createJsonRequest(method: 'GET' | 'PUT', url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
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
  const store = { statusCode: 0, body: '' };
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

function buildContext() {
  return {
    db,
    persistItemWithinTransaction,
    logEvent,
    getItem,
    getBox,
    listEventsForItem,
    getAgenticRun,
    enqueueShopwareSyncJob
  };
}

afterAll(() => {
  try {
    db.close();
  } catch (error) {
    console.warn('[save-item-quality.test] Failed to close database', error);
  }
  removeTestDatabase();
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_DB_PATH;
  }
});

beforeEach(() => {
  clearDatabase();
});

describe('save-item quality and Shopartikel defaults', () => {
  test('derives Shopartikel from quality when not provided', async () => {
    const ctx = buildContext();
    const request = createJsonRequest('PUT', '/api/items/Q-100', {
      actor: 'tester',
      Artikel_Nummer: 'Q-REF-100',
      Artikelbeschreibung: 'Niedrig',
      Quality: 2,
      Auf_Lager: 1
    });
    const response = createMockResponse();

    await saveItemAction.handle(request, response, ctx);

    expect(response.statusCode).toBe(200);
    const reference = selectReference.get('Q-REF-100') as { Quality: number; Shopartikel: number } | undefined;
    expect(reference?.Quality).toBe(2);
    expect(reference?.Shopartikel).toBe(0);
  });

  test('defaults Shopartikel to 1 when quality meets threshold', async () => {
    const ctx = buildContext();
    const request = createJsonRequest('PUT', '/api/items/Q-200', {
      actor: 'tester',
      Artikel_Nummer: 'Q-REF-200',
      Artikelbeschreibung: 'Standard',
      Quality: 4,
      Auf_Lager: 1
    });
    const response = createMockResponse();

    await saveItemAction.handle(request, response, ctx);

    expect(response.statusCode).toBe(200);
    const reference = selectReference.get('Q-REF-200') as { Quality: number; Shopartikel: number } | undefined;
    expect(reference?.Quality).toBe(4);
    expect(reference?.Shopartikel).toBe(1);
  });

  test('respects explicit Shopartikel override', async () => {
    const ctx = buildContext();
    const request = createJsonRequest('PUT', '/api/items/Q-300', {
      actor: 'tester',
      Artikel_Nummer: 'Q-REF-300',
      Artikelbeschreibung: 'Override Shopartikel',
      Quality: 5,
      Shopartikel: 0,
      Auf_Lager: 1
    });
    const response = createMockResponse();

    await saveItemAction.handle(request, response, ctx);

    expect(response.statusCode).toBe(200);
    const reference = selectReference.get('Q-REF-300') as { Quality: number; Shopartikel: number } | undefined;
    expect(reference?.Quality).toBe(5);
    expect(reference?.Shopartikel).toBe(0);
  });
});
