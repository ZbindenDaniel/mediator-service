export {};

const { Readable } = require('stream');

const importItemModule = require('../backend/actions/import-item');
const importItemAction = importItemModule.default || importItemModule;

describe('import-item action Grafikname handling', () => {
  function createRequest(body) {
    const stream = new Readable({
      read() {
        this.push(body);
        this.push(null);
      }
    });
    stream.method = 'POST';
    stream.url = '/api/import/item';
    stream.headers = { 'content-type': 'application/x-www-form-urlencoded' };
    return stream;
  }

  function createResponse() {
    return {
      statusCode: 0,
      headers: {},
      body: '',
      writeHead(status, headers) {
        this.statusCode = status;
        this.headers = headers;
      },
      end(chunk) {
        if (chunk) {
          this.body += chunk;
        }
      }
    };
  }

  test('keeps provided Grafikname when no photos are included', async () => {
    const requestBody = new URLSearchParams({
      actor: 'tester',
      BoxID: 'B-010101-0001',
      ItemUUID: 'I-010101-0001',
      Artikel_Nummer: 'MAT-100',
      Artikelbeschreibung: 'Referenzteil',
      Auf_Lager: '1',
      Grafikname: '/media/I-000001/photo.jpg'
    }).toString();

    const req = createRequest(requestBody);
    const res = createResponse();

    const upsertItemCalls = [];
    const ctx = {
      getMaxBoxId: { get: () => ({ BoxID: 'B-000000-0000' }) },
      getMaxItemId: { get: () => ({ ItemUUID: 'I-000000-0000' }) },
      upsertBox: { run: () => {} },
      upsertItem: { run: (payload) => upsertItemCalls.push(payload) },
      upsertAgenticRun: { run: () => {} },
      logEvent: { run: () => {} },
      db: {
        transaction(handler) {
          return (...args) => handler(...args);
        }
      }
    };

    await importItemAction.handle(req, res, ctx);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.ok).toBe(true);
    expect(upsertItemCalls.length).toBe(1);
    expect(upsertItemCalls[0].Grafikname).toBe('/media/I-000001/photo.jpg');
  });
});
