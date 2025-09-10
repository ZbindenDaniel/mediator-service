import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.HTTP_PORT = '0';
process.env.DB_PATH = path.join(__dirname, 'test-db.sqlite');
process.env.INBOX_DIR = path.join(__dirname, 'test-inbox');
process.env.ARCHIVE_DIR = path.join(__dirname, 'test-archive');

const { server } = require('./server');

let baseUrl = '';

beforeAll((done) => {
  server.listen(0, () => {
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
    done();
  });
});

afterAll((done) => {
  server.close(() => {
    fs.rmSync(process.env.DB_PATH!, { force: true });
    fs.rmSync(process.env.INBOX_DIR!, { recursive: true, force: true });
    fs.rmSync(process.env.ARCHIVE_DIR!, { recursive: true, force: true });
    done();
  });
});

async function postForm(url: string, data: Record<string, string>) {
  const body = new URLSearchParams(data).toString();
  return fetch(baseUrl + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
}

test('health endpoint works', async () => {
  const r = await fetch(baseUrl + '/api/health');
  const j = await r.json();
  expect(j.ok).toBe(true);
});

test('getNewMaterialNumber returns a number', async () => {
  const r = await fetch(baseUrl + '/api/getNewMaterialNumber');
  const j = await r.json();
  expect(j.nextArtikelNummer).toMatch(/^\d{5}$/);
});

test('create item and retrieve via box and search', async () => {
  const res = await postForm('/api/import/item', {
    BoxID: 'BOX-0000-0001',
    ItemUUID: 'I-0000-0001',
    Artikel_Nummer: '1000',
    Artikelbeschreibung: 'Test Item',
    Location: 'A-01-01',
    actor: 'tester'
  });
  expect(res.status).toBe(200);
  const created = await res.json();
  expect(created.ok).toBe(true);

  const boxRes = await fetch(baseUrl + '/api/boxes/BOX-0000-0001');
  const boxData = await boxRes.json();
  expect(boxData.items.length).toBe(1);

  const searchRes = await fetch(baseUrl + '/api/search?term=1000');
  const searchData = await searchRes.json();
  expect(Array.isArray(searchData.items)).toBe(true);
  expect(searchData.items.length).toBe(1);
  const searchBox = await fetch(baseUrl + '/api/search?term=BOX-0000');
  const searchBoxData = await searchBox.json();
  expect((searchBoxData.boxes || []).length).toBe(1);

  const searchPart = await fetch(baseUrl + '/api/search?term=Test');
  const searchPartData = await searchPart.json();
  expect(searchPartData.items.length).toBe(1);

  const searchLoc = await fetch(baseUrl + '/api/search?term=A-01');
  const searchLocData = await searchLoc.json();
  expect(searchLocData.items.length).toBe(1);
  expect(searchLocData.boxes.length).toBe(1);

  const printBox = await fetch(baseUrl + '/api/print/box/BOX-0000-0001', { method: 'POST' });
  expect(printBox.status).toBe(200);
  const printItem = await fetch(baseUrl + '/api/print/item/I-0000-0001', { method: 'POST' });
  expect(printItem.status).toBe(200);

  const badCsv = await fetch(baseUrl + '/api/import/validate', { method: 'POST', body: 'foo,bar\n1,2' });
  expect(badCsv.status).toBe(400);
  const goodCsv = await fetch(baseUrl + '/api/import/validate', { method: 'POST', body: 'ItemUUID,BoxID\na,b' });
  expect(goodCsv.status).toBe(200);

  const saveBad = await fetch(baseUrl + '/api/items/I-0000-0001', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Artikelbeschreibung: 'x' })
  });
  expect(saveBad.status).toBe(400);

  const saveOk = await fetch(baseUrl + '/api/items/I-0000-0001', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Artikelbeschreibung: 'Updated', actor: 'tester' })
  });
  expect(saveOk.status).toBe(200);

  const csvData = fs.readFileSync(path.join(__dirname, 'test.csv'));
  const csvRes = await fetch(baseUrl + '/api/import', {
    method: 'POST',
    headers: { 'x-filename': 'test.csv' },
    body: csvData
  });
  expect(csvRes.status).toBe(200);
});

test('create box separately and move item', async () => {
  const res = await postForm('/api/import/item', {
    BoxID: 'BOX-0000-0002',
    ItemUUID: 'I-0000-0002',
    Artikel_Nummer: '1001',
    Artikelbeschreibung: 'Item Zwei',
    Location: 'A-01-02',
    actor: 'tester'
  });
  expect(res.status).toBe(200);
  const moveFail = await fetch(baseUrl + '/api/items/I-0000-0002/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toBoxId: 'BOX-0000-9999', actor: 'tester' })
  });
  expect(moveFail.status).toBe(404);
  const createBox = await fetch(baseUrl + '/api/boxes/BOX-0000-9999', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'tester' })
  });
  expect(createBox.status).toBe(200);
  const moveOk = await fetch(baseUrl + '/api/items/I-0000-0002/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toBoxId: 'BOX-0000-9999', actor: 'tester' })
  });
  expect(moveOk.status).toBe(200);
});
