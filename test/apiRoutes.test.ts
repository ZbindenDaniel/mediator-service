export {};

const fs = require('fs');
const path = require('path');
const { server: testServer, resetData: resetTestData } = require('./server');

process.env.NODE_ENV = 'test';
process.env.HTTP_PORT = '0';
process.env.DB_PATH = path.join(__dirname, 'test-db.sqlite');
process.env.INBOX_DIR = path.join(__dirname, 'test-inbox');
process.env.ARCHIVE_DIR = path.join(__dirname, 'test-archive');

let baseUrl = '';

const today = (() => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
})();

function boxId(n) {
  return `B-${today}-${String(n).padStart(4, '0')}`;
}

function itemId(n) {
  return `I-${today}-${String(n).padStart(4, '0')}`;
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    testServer.listen(0, () => {
      const addr = testServer.address();
      if (typeof addr === 'object' && addr) {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    testServer.close(() => {
      fs.rmSync(process.env.DB_PATH, { force: true });
      fs.rmSync(process.env.INBOX_DIR, { recursive: true, force: true });
      fs.rmSync(process.env.ARCHIVE_DIR, { recursive: true, force: true });
      resolve();
    });
  });
});

beforeEach(() => {
  resetTestData();
});

async function postForm(url, data) {
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
  expect(/\d{5}/.test(j.nextArtikelNummer)).toBe(true);
});

test('create item and retrieve via box and search', async () => {
  const res = await postForm('/api/import/item', {
    BoxID: boxId(1),
    ItemUUID: itemId(1),
    Artikel_Nummer: '1000',
    Artikelbeschreibung: 'Test Item',
    Location: 'A-01-01',
    actor: 'tester'
  });
  expect(res.status).toBe(200);
  const created = await res.json();
  expect(created.ok).toBe(true);

  const boxRes = await fetch(baseUrl + `/api/boxes/${boxId(1)}`);
  const boxData = await boxRes.json();
  expect(boxData.items.length).toBe(1);

  const searchRes = await fetch(baseUrl + '/api/search?term=1000');
  const searchData = await searchRes.json();
  expect(Array.isArray(searchData.items)).toBe(true);
  expect(searchData.items.length).toBe(1);
  const searchBox = await fetch(baseUrl + `/api/search?term=${boxId(1).slice(0, 8)}`);
  const searchBoxData = await searchBox.json();
  expect((searchBoxData.boxes || []).length).toBe(1);

  const searchPart = await fetch(baseUrl + '/api/search?term=Test');
  const searchPartData = await searchPart.json();
  expect(searchPartData.items.length).toBe(1);

  const searchLoc = await fetch(baseUrl + '/api/search?term=A-01');
  const searchLocData = await searchLoc.json();
  expect(searchLocData.items.length).toBe(1);
  expect(searchLocData.boxes.length).toBe(1);

  const printBox = await fetch(baseUrl + `/api/print/box/${boxId(1)}`, { method: 'POST' });
  expect(printBox.status).toBe(200);
  const boxPayload = await printBox.json();
  expect(boxPayload.template).toBe('/print/box-label.html');
  expect(!!boxPayload.payload).toBe(true);
  expect(boxPayload.payload.id).toBe(boxId(1));
  expect((boxPayload.payload.qrDataUri || '').startsWith('data:image/png;base64,')).toBe(true);
  expect(Array.isArray(boxPayload.payload.qrModules)).toBe(true);
  expect(Number.isInteger(boxPayload.payload.qrMargin)).toBe(true);

  const printItem = await fetch(baseUrl + `/api/print/item/${itemId(1)}`, { method: 'POST' });
  expect(printItem.status).toBe(200);
  const itemPayload = await printItem.json();
  expect(itemPayload.template).toBe('/print/item-label.html');
  expect(!!itemPayload.payload).toBe(true);
  expect(itemPayload.payload.id).toBe(itemId(1));
  expect((itemPayload.payload.qrDataUri || '').startsWith('data:image/png;base64,')).toBe(true);
  expect(Array.isArray(itemPayload.payload.qrModules)).toBe(true);
  expect(Number.isInteger(itemPayload.payload.qrMargin)).toBe(true);

  const badCsv = await fetch(baseUrl + '/api/import/validate', { method: 'POST', body: 'foo,bar\n1,2' });
  expect(badCsv.status).toBe(400);
  const goodCsv = await fetch(baseUrl + '/api/import/validate', { method: 'POST', body: 'ItemUUID,BoxID\na,b' });
  expect(goodCsv.status).toBe(200);
  const goodData = await goodCsv.json();
  expect(goodData.itemCount).toBe(1);
  expect(goodData.boxCount).toBe(1);

  const saveBad = await fetch(baseUrl + `/api/items/${itemId(1)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Artikelbeschreibung: 'x' })
  });
  expect(saveBad.status).toBe(400);

  const saveOk = await fetch(baseUrl + `/api/items/${itemId(1)}`, {
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
    BoxID: boxId(2),
    ItemUUID: itemId(2),
    Artikel_Nummer: '1001',
    Artikelbeschreibung: 'Item Zwei',
    Location: 'A-01-02',
    actor: 'tester'
  });
  expect(res.status).toBe(200);
  const moveFail = await fetch(baseUrl + `/api/items/${itemId(2)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toBoxId: 'B-000000-9999', actor: 'tester' })
  });
  expect(moveFail.status).toBe(404);
  const createBox = await fetch(baseUrl + '/api/boxes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'tester' })
  });
  expect(createBox.status).toBe(200);
  const createData = await createBox.json();
  expect(/B-\d{6}-\d{4}/.test(createData.id)).toBe(true);
  const moveOk = await fetch(baseUrl + `/api/items/${itemId(2)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toBoxId: createData.id, actor: 'tester' })
  });
  expect(moveOk.status).toBe(200);
});

test('increment and decrement item stock', async () => {
  const res = await postForm('/api/import/item', {
    BoxID: boxId(3),
    ItemUUID: itemId(3),
    Artikel_Nummer: '1002',
    Artikelbeschreibung: 'Stock Item',
    Location: 'A-01-03',
    actor: 'tester'
  });
  expect(res.status).toBe(200);
  const add = await fetch(baseUrl + `/api/items/${itemId(3)}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'tester' })
  });
  expect(add.status).toBe(200);
  const addData = await add.json();
  expect(addData.quantity).toBe(2);
  const remove = await fetch(baseUrl + `/api/items/${itemId(3)}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'tester' })
  });
  expect(remove.status).toBe(200);
  const removeData = await remove.json();
  expect(removeData.quantity).toBe(1);
  const remove2 = await fetch(baseUrl + `/api/items/${itemId(3)}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'tester' })
  });
  expect(remove2.status).toBe(200);
  const removeData2 = await remove2.json();
  expect(removeData2.quantity).toBe(0);
  const detail = await fetch(baseUrl + `/api/items/${itemId(3)}`);
  const detailData = await detail.json();
  expect(detailData.item.BoxID).toBeNull();
});

test('list items returns data', async () => {
  await postForm('/api/import/item', {
    BoxID: boxId(4),
    ItemUUID: itemId(4),
    Artikel_Nummer: '1003',
    Artikelbeschreibung: 'List Item',
    Location: 'A-01-04',
    actor: 'tester'
  });
  const r = await fetch(baseUrl + '/api/items');
  const j = await r.json();
  expect(Array.isArray(j.items)).toBe(true);
  expect(j.items.length).toBeGreaterThan(0);
});
