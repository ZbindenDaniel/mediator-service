const http = require('http');
const { URL } = require('url');

const boxes = new Map();
const items = new Map();
let materialCounter = 10000;
let boxCounter = 0;

function resetData() {
  boxes.clear();
  items.clear();
  materialCounter = 10000;
  boxCounter = 0;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function ensureBox(boxId, location = '') {
  if (!boxes.has(boxId)) {
    boxes.set(boxId, { id: boxId, location, items: new Set() });
  }
  return boxes.get(boxId);
}

function formatItem(item) {
  return {
    ItemUUID: item.id,
    BoxID: item.boxId,
    Artikel_Nummer: item.artikelNummer,
    Artikelbeschreibung: item.description,
    Location: item.location,
    quantity: item.quantity
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

function generateBoxId() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  boxCounter += 1;
  return `B-${dd}${mm}${yy}-${String(boxCounter).padStart(4, '0')}`;
}

async function handleImportItem(req, res) {
  const body = await parseBody(req);
  const params = new URLSearchParams(body.toString());
  const itemId = params.get('ItemUUID');
  const boxId = params.get('BoxID');
  if (!itemId || !boxId) {
    return sendJson(res, 400, { error: 'ItemUUID and BoxID required' });
  }
  const artikelNummer = params.get('Artikel_Nummer') || '';
  const description = params.get('Artikelbeschreibung') || '';
  const location = params.get('Location') || '';
  const actor = params.get('actor');
  if (!actor) {
    return sendJson(res, 400, { error: 'actor required' });
  }
  const quantity = Number(params.get('Auf_Lager') || '1') || 1;
  const item = {
    id: itemId,
    boxId,
    artikelNummer,
    description,
    location,
    quantity
  };
  items.set(itemId, item);
  const box = ensureBox(boxId, location);
  box.items.add(itemId);
  console.log('[test server] imported item', itemId, 'into', boxId, 'box size now', box.items.size);
  return sendJson(res, 200, { ok: true });
}

async function handleImportValidate(req, res) {
  const body = await parseBody(req);
  const csv = body.toString().trim();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return sendJson(res, 400, { error: 'empty csv' });
  }
  const headers = lines[0].split(',');
  if (!headers.includes('ItemUUID') || !headers.includes('BoxID')) {
    return sendJson(res, 400, { error: 'invalid csv headers' });
  }
  let itemCount = 0;
  const boxSet = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    if (cols.length < 2) continue;
    itemCount += 1;
    boxSet.add(cols[1]);
  }
  return sendJson(res, 200, { itemCount, boxCount: boxSet.size });
}

async function handleImportCsv(req, res) {
  const body = await parseBody(req);
  const csv = body.toString();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return sendJson(res, 400, { error: 'no data' });
  }
  const headers = lines[0].split(',');
  const idx = {
    ItemUUID: headers.indexOf('ItemUUID'),
    BoxID: headers.indexOf('BoxID'),
    Artikel_Nummer: headers.indexOf('Artikel_Nummer'),
    Artikelbeschreibung: headers.indexOf('Artikelbeschreibung'),
    Location: headers.indexOf('Location'),
    Auf_Lager: headers.indexOf('Auf_Lager')
  };
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const id = cols[idx.ItemUUID];
    const boxId = cols[idx.BoxID];
    if (!id || !boxId) continue;
    const quantity = Number(cols[idx.Auf_Lager] || '1') || 1;
    const item = {
      id,
      boxId,
      artikelNummer: cols[idx.Artikel_Nummer] || '',
      description: cols[idx.Artikelbeschreibung] || '',
      location: cols[idx.Location] || '',
      quantity
    };
    items.set(id, item);
    ensureBox(boxId, item.location).items.add(id);
  }
  return sendJson(res, 200, { ok: true });
}

function handleGetBox(res, boxId) {
  const box = boxes.get(boxId);
  const data = box
    ? Array.from(box.items).map((id) => formatItem(items.get(id)))
    : [];
  console.log('[test server] get box', boxId, 'items returned', data.length);
  return sendJson(res, 200, { items: data });
}

function handleSearch(res, term) {
  const query = term.toLowerCase();
  const itemResults = Array.from(items.values()).filter((item) => {
    return (
      item.id.toLowerCase().includes(query) ||
      item.artikelNummer.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.location.toLowerCase().includes(query)
    );
  }).map((item) => formatItem(item));

  const boxResults = Array.from(boxes.values()).filter((box) =>
    box.id.toLowerCase().includes(query) || box.location.toLowerCase().includes(query)
  ).map((box) => ({ id: box.id, location: box.location }));

  return sendJson(res, 200, { items: itemResults, boxes: boxResults });
}

async function handleUpdateItem(req, res, itemId) {
  const item = items.get(itemId);
  if (!item) {
    return sendJson(res, 404, { error: 'item not found' });
  }
  const body = await parseBody(req);
  let payload;
  try {
    payload = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  if (!payload || !payload.actor) {
    return sendJson(res, 400, { error: 'actor required' });
  }
  if (payload.Artikelbeschreibung) {
    item.description = payload.Artikelbeschreibung;
  }
  return sendJson(res, 200, { ok: true });
}

async function handleMoveItem(req, res, itemId) {
  const item = items.get(itemId);
  if (!item) {
    return sendJson(res, 404, { error: 'item not found' });
  }
  const body = await parseBody(req);
  let payload;
  try {
    payload = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  if (!payload.actor || !payload.toBoxId) {
    return sendJson(res, 400, { error: 'actor and toBoxId required' });
  }
  if (!boxes.has(payload.toBoxId)) {
    return sendJson(res, 404, { error: 'box not found' });
  }
  if (item.boxId && boxes.has(item.boxId)) {
    boxes.get(item.boxId).items.delete(item.id);
  }
  item.boxId = payload.toBoxId;
  boxes.get(payload.toBoxId).items.add(item.id);
  return sendJson(res, 200, { ok: true });
}

async function handleAdjustStock(req, res, itemId, delta) {
  const item = items.get(itemId);
  if (!item) {
    return sendJson(res, 404, { error: 'item not found' });
  }
  const body = await parseBody(req);
  let payload;
  try {
    payload = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  if (!payload.actor) {
    return sendJson(res, 400, { error: 'actor required' });
  }
  item.quantity = Math.max(0, item.quantity + delta);
  if (item.quantity === 0) {
    if (item.boxId && boxes.has(item.boxId)) {
      boxes.get(item.boxId).items.delete(item.id);
    }
    item.boxId = null;
  }
  return sendJson(res, 200, { quantity: item.quantity });
}

function handleGetItem(res, itemId) {
  const item = items.get(itemId);
  if (!item) {
    return sendJson(res, 404, { error: 'not found' });
  }
  return sendJson(res, 200, { item: formatItem(item) });
}

function handleListItems(res) {
  const data = Array.from(items.values()).map((item) => formatItem(item));
  return sendJson(res, 200, { items: data });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      return sendJson(res, 400, { error: 'missing url' });
    }
    const parsed = new URL(req.url, 'http://localhost');
    const { pathname, searchParams } = parsed;

    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && pathname === '/api/getNewMaterialNumber') {
      const next = String(materialCounter++).padStart(5, '0');
      return sendJson(res, 200, { nextArtikelNummer: next });
    }
    if (req.method === 'POST' && pathname === '/api/import/item') {
      return handleImportItem(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/import/validate') {
      return handleImportValidate(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/import') {
      return handleImportCsv(req, res);
    }
    if (req.method === 'GET' && pathname.startsWith('/api/boxes/')) {
      const boxId = decodeURIComponent(pathname.split('/').pop());
      return handleGetBox(res, boxId);
    }
    if (req.method === 'GET' && pathname === '/api/search') {
      const term = searchParams.get('term') || '';
      return handleSearch(res, term);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/print/')) {
      const segments = pathname.split('/').filter(Boolean);
      const type = segments[2];
      const id = decodeURIComponent(segments[3] || '');
      if (!id) {
        return sendJson(res, 400, { error: 'missing id' });
      }
      if (type === 'box') {
        ensureBox(id);
        return sendJson(res, 200, {
          template: '/print/box-label.html',
          payload: {
            id,
            location: 'Testlager',
            notes: null,
            placedBy: 'SpecRunner',
            placedAt: new Date().toISOString()
          }
        });
      }
      const fallbackBox = ensureBox('B-PRINT-0001', 'Testlager');
      return sendJson(res, 200, {
        template: '/print/item-label.html',
        payload: {
          id,
          articleNumber: '00001',
          boxId: fallbackBox.id,
          location: fallbackBox.location
        }
      });
    }
    if (req.method === 'PUT' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.split('/')[3]);
      return handleUpdateItem(req, res, itemId);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/move')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleMoveItem(req, res, itemId);
    }
    if (req.method === 'POST' && pathname === '/api/boxes') {
      const body = await parseBody(req);
      let payload = {};
      try {
        payload = JSON.parse(body.toString() || '{}');
      } catch (err) {
        return sendJson(res, 400, { error: 'invalid json' });
      }
      if (!payload.actor) {
        return sendJson(res, 400, { error: 'actor required' });
      }
      const id = generateBoxId();
      ensureBox(id);
      return sendJson(res, 200, { id });
    }
    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/add')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleAdjustStock(req, res, itemId, 1);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/remove')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleAdjustStock(req, res, itemId, -1);
    }
    if (req.method === 'GET' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.split('/')[3]);
      return handleGetItem(res, itemId);
    }
    if (req.method === 'GET' && pathname === '/api/items') {
      return handleListItems(res);
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[test server] unexpected error', err);
    return sendJson(res, 500, { error: 'internal error' });
  }
});

module.exports = {
  server,
  resetData
};
