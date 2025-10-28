const http = require('http');

const boxes = new Map();
const items = new Map();
const agenticRuns = new Map();
let materialCounter = 10000;
let boxCounter = 0;
let agenticHealthChecks = 0;
let agenticHealthResponse: { status: number; body: any } = { status: 200, body: { ok: true } };

function resetData() {
  boxes.clear();
  items.clear();
  agenticRuns.clear();
  materialCounter = 10000;
  boxCounter = 0;
  agenticHealthChecks = 0;
  agenticHealthResponse = { status: 200, body: { ok: true } };
}

function setAgenticHealthResponse(status: number, body: any) {
  agenticHealthResponse = { status, body };
}

function getAgenticHealthCheckCount() {
  return agenticHealthChecks;
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

function getAgenticRun(itemId) {
  return agenticRuns.get(itemId) || null;
}

function saveAgenticRun(itemId, data) {
  const nowIso = new Date().toISOString();
  const existing = agenticRuns.get(itemId) || {};
  const run = {
    ItemUUID: itemId,
    SearchQuery: typeof data.SearchQuery === 'string' ? data.SearchQuery : existing.SearchQuery || '',
    Status: data.Status || existing.Status || 'queued',
    LastModified: nowIso,
    ReviewState: data.ReviewState || existing.ReviewState || 'not_required',
    ReviewedBy: data.ReviewedBy ?? null
  };
  agenticRuns.set(itemId, run);
  return run;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
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
  const params = new URLSearchParams((body as Buffer).toString());
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
  const body = await parseBody(req) as Buffer;
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
  const body = (await parseBody(req)) as Buffer;
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
  const body = (await parseBody(req)) as Buffer;
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
  const body = (await parseBody(req)) as Buffer;
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
  const body = (await parseBody(req) as Buffer);
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

async function handleAgenticRestart(req, res, itemId) {
  const item = items.get(itemId);
  if (!item) {
    return sendJson(res, 404, { error: 'item not found' });
  }
  const body = (await parseBody(req)) as Buffer;
  let payload: { actor?: string; search?: string } = {};
  try {
    payload = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  if (!payload.actor) {
    return sendJson(res, 400, { error: 'actor required' });
  }
  const searchQuery = (payload.search || item.description || '').trim();
  const run = saveAgenticRun(itemId, {
    Status: 'queued',
    SearchQuery: searchQuery,
    ReviewState: 'not_required',
    ReviewedBy: null
  });
  return sendJson(res, 200, { agentic: run });
}

async function handleAgenticCancel(req, res, itemId) {
  const run = getAgenticRun(itemId);
  if (!run) {
    return sendJson(res, 404, { error: 'Agentic run not found' });
  }
  const body = (await parseBody(req)) as Buffer;
  let payload: { actor?: string } = {};
  try {
    payload = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  if (!payload.actor) {
    return sendJson(res, 400, { error: 'actor required' });
  }
  const updated = saveAgenticRun(itemId, {
    Status: 'cancelled',
    SearchQuery: run.SearchQuery,
    ReviewState: 'not_required',
    ReviewedBy: null
  });
  return sendJson(res, 200, { agentic: updated });
}

async function handleAgenticTriggerProxy(req, res) {
  const body = (await parseBody(req)) as Buffer;
  let parsed: any = {};
  try {
    parsed = JSON.parse(body.toString() || '{}');
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid json' });
  }

  const payload =
    parsed && typeof parsed === 'object' && parsed.payload && typeof parsed.payload === 'object'
      ? parsed.payload
      : parsed;

  const artikelbeschreibung = (payload?.artikelbeschreibung || payload?.search || '').trim();
  const itemId = (payload?.itemId || payload?.id || '').trim();

  if (!artikelbeschreibung) {
    return sendJson(res, 400, { error: 'missing artikelbeschreibung' });
  }

  if (!itemId) {
    return sendJson(res, 400, { error: 'missing itemId' });
  }

  saveAgenticRun(itemId, {
    Status: 'queued',
    SearchQuery: artikelbeschreibung,
    ReviewState: 'not_required',
    ReviewedBy: null
  });

  return sendJson(res, 202, { ok: true });
}

function handleAgenticStatus(res, itemId) {
  const run = getAgenticRun(itemId);
  return sendJson(res, 200, { agentic: run });
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

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/agentic/health')) {
      agenticHealthChecks += 1;
      const { status, body } = agenticHealthResponse;
      return sendJson(res, status, body);
    }
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
    if (req.method === 'POST' && pathname === '/api/agentic/run') {
      return handleAgenticTriggerProxy(req, res);
    }
    if (req.method === 'GET' && pathname.startsWith('/api/boxes/')) {
      const boxId = decodeURIComponent(pathname.split('/').pop() || '');
      return handleGetBox(res, boxId);
    }
    if (req.method === 'GET' && pathname === '/api/search') {
      const term = searchParams.get('term') || '';
      return handleSearch(res, term);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/print/')) {
      const rawBody = (await parseBody(req)) as Buffer;
      let payload: { actor?: string } = {};
      if (rawBody.length) {
        try {
          payload = JSON.parse(rawBody.toString() || '{}');
        } catch (err) {
          console.error('[test server] invalid json for print request', err);
          return sendJson(res, 400, { error: 'invalid json' });
        }
      }
      const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
      if (!actor) {
        return sendJson(res, 400, { error: 'actor required' });
      }
      return sendJson(res, 200, { ok: true, actor });
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
    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/agentic/restart')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleAgenticRestart(req, res, itemId);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/agentic/cancel')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleAgenticCancel(req, res, itemId);
    }
    if (req.method === 'POST' && pathname === '/api/boxes') {
      const body = (await parseBody(req)) as Buffer;
      let payload: { actor?: string } = {};
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
    if (req.method === 'GET' && pathname.startsWith('/api/items/') && pathname.endsWith('/agentic')) {
      const parts = pathname.split('/');
      const itemId = decodeURIComponent(parts[3]);
      return handleAgenticStatus(res, itemId);
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
  resetData,
  setAgenticHealthResponse,
  getAgenticHealthCheckCount
};
