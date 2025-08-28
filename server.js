const fs = require("fs");
const path = require("path");
const http = require("http");
const chokidar = require("chokidar");
const { HTTP_PORT, INBOX_DIR, ARCHIVE_DIR } = require("./config");
const { ingestCsvFile } = require("./importer");
const {
  db, getItem, findByMaterial, itemsByBox, getBox, listBoxes,
  nextLabelJob, updateLabelJobStatus,
  logEvent, listEventsForBox, listEventsForItem
} = require("./db");
const { zplForItem, sendZpl } = require("./print");

fs.mkdirSync(INBOX_DIR, { recursive: true });
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

async function handleCsv(absPath) {
  try {
    const { count, boxes } = await ingestCsvFile(absPath);
    const to = path.join(ARCHIVE_DIR, path.basename(absPath).replace(/\.csv$/i, `.${Date.now()}.csv`));
    fs.renameSync(absPath, to);
    console.log(`Ingested ${count} rows from ${path.basename(absPath)} → boxes: ${boxes.join(", ")}`);
  } catch (e) {
    console.error(`Failed ingest ${absPath}:`, e.message);
  }
}

chokidar
  .watch(INBOX_DIR, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 250 } })
  .on("add", p => p.endsWith(".csv") && handleCsv(p))
  .on("change", p => p.endsWith(".csv") && handleCsv(p));

async function runPrintWorker() {
  const job = nextLabelJob.get();
  if (!job) return;
  try {
    const item = getItem.get(job.ItemUUID);
    if (!item) {
      updateLabelJobStatus.run("Error", "item not found", job.Id);
      return;
    }
    const zpl = zplForItem({ materialNumber: item.MaterialNumber, itemUUID: item.ItemUUID });
    await sendZpl(zpl);
    updateLabelJobStatus.run("Done", null, job.Id);
  } catch (e) {
    updateLabelJobStatus.run("Error", e.message, job.Id);
  }
}
setInterval(runPrintWorker, 750);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health + landing
if (url.pathname === "/" && req.method === "GET") {
  const p = path.join(__dirname, "public", "index.html");
  try {
    const html = fs.readFileSync(p);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  } catch {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(`Mediator up. Drop CSVs into ${INBOX_DIR}\n`);
  }
}

  // Box placement page
  if (url.pathname.startsWith("/box/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.replace("/box/", ""));
    const box = getBox.get(id);
    if (!box) { res.writeHead(404); return res.end("Box not found"); }
    const events = listEventsForBox.all(id);
    const html = `<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${box.BoxID} · Place Box</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:16px;line-height:1.4}
input,textarea,button{font:inherit;padding:8px;margin:4px 0;width:100%}
.row{max-width:640px}
.ev{font-size:.9em;color:#555}
</style>
<div class="row">
  <h1>Box ${box.BoxID}</h1>
  <form method="post" action="/api/boxes/${encodeURIComponent(box.BoxID)}/place">
    <label>Location (aisle/bin/shelf)</label>
    <input name="location" value="${box.Location || ''}" required />
    <label>Your name</label>
    <input name="actor" placeholder="Initials or name" />
    <label>Notes</label>
    <textarea name="notes" rows="3">${box.BoxNotes || ''}</textarea>
    <button type="submit">Save placement</button>
  </form>
  <p class="ev">Recent activity:</p>
  <ul>
    ${events.map(e => `<li class="ev">${e.When} — ${e.Event} ${e.Actor ? 'by '+e.Actor : ''} ${e.Meta ? ' ('+e.Meta+')' : ''}</li>`).join('')}
  </ul>
</div>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  // Place box location
  if (url.pathname.match(/^\/api\/boxes\/[^/]+\/place$/) && req.method === "POST") {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const box = getBox.get(id);
    if (!box) { res.writeHead(404); return res.end("Box not found"); }
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const location = (params.get("location") || "").trim();
      const actor = (params.get("actor") || "").trim();
      const notes = (params.get("notes") || "").trim();

      db.prepare(`UPDATE boxes SET Location=?, BoxNotes=?, PlacedBy=?, PlacedAt=datetime('now'), UpdatedAt=datetime('now') WHERE BoxID=?`)
        .run(location, notes, actor, id);

      const meta = JSON.stringify({ location, notes });
      logEvent.run({ Actor: actor || null, EntityType: "Box", EntityId: id, Event: "Placed", Meta: meta });

      res.writeHead(302, { Location: `/box/${encodeURIComponent(id)}` });
      res.end();
    });
    return;
  }

  // QR redirect (items)
  if (url.pathname.startsWith("/qr/")) {
    const uuid = decodeURIComponent(url.pathname.slice(4));
    const item = getItem.get(uuid);
    if (!item) { res.writeHead(404); return res.end("Not found"); }
    if (item.WmsLink) {
      res.writeHead(302, { Location: item.WmsLink });
      return res.end();
    }
    return sendJson(res, 200, { message: "No WMS link; returning item", item });
  }

  // API: list boxes
  if (url.pathname === "/api/boxes" && req.method === "GET") {
    return sendJson(res, 200, listBoxes.all());
  }

  // API: box detail
  if (url.pathname.startsWith("/api/boxes/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.replace("/api/boxes/", ""));
    const box = getBox.get(id);
    if (!box) { return sendJson(res, 404, { error: "not found" }); }
    return sendJson(res, 200, { box, items: itemsByBox.all(id), events: listEventsForBox.all(id) });
  }

  // API: search by material
  if (url.pathname === "/api/search" && req.method === "GET") {
    const material = url.searchParams.get("material") || "";
    if (!material) return sendJson(res, 400, { error: "material query is required" });
    return sendJson(res, 200, { items: findByMaterial.all(material) });
  }

  // API: item detail
  if (url.pathname.startsWith("/api/items/") && req.method === "GET") {
    const uuid = decodeURIComponent(url.pathname.replace("/api/items/",""));
    const item = getItem.get(uuid);
    if (!item) return sendJson(res, 404, { error: "not found" });
    const box = getBox.get(item.BoxID);
    return sendJson(res, 200, { item, box, events: listEventsForItem.all(uuid) });
  }

  // API: update item note
  if (url.pathname.match(/^\/api\/items\/[^/]+\/note$/) && req.method === "POST") {
    const uuid = decodeURIComponent(url.pathname.split("/")[3]);
    const item = getItem.get(uuid);
    if (!item) return sendJson(res, 404, { error: "not found" });

    let body=""; req.on("data",c=>body+=c); req.on("end", () => {
      const { note, actor } = JSON.parse(body || "{}");
      db.prepare(`UPDATE items SET ItemNotes=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(note || "", uuid);
      logEvent.run({ Actor: actor || null, EntityType: "Item", EntityId: uuid, Event: "Note", Meta: JSON.stringify({ note }) });
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  // API: move item between boxes (optional)
  if (url.pathname.match(/^\/api\/items\/[^/]+\/move$/) && req.method === "POST") {
    const uuid = decodeURIComponent(url.pathname.split("/")[3]);
    const item = getItem.get(uuid);
    if (!item) return sendJson(res, 404, { error: "not found" });

    let body=""; req.on("data",c=>body+=c); req.on("end", () => {
      const { toBoxId, actor } = JSON.parse(body || "{}");
      if (!toBoxId) return sendJson(res, 400, { error: "toBoxId required" });
      const dest = getBox.get(toBoxId);
      if (!dest) return sendJson(res, 404, { error: "destination box not found" });

      db.prepare(`UPDATE items SET BoxID=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(toBoxId, uuid);
      logEvent.run({ Actor: actor || null, EntityType: "Item", EntityId: uuid, Event: "Moved", Meta: JSON.stringify({ from: item.BoxID, to: toBoxId }) });
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  // API: export snapshot for WMS
  if (url.pathname === "/api/export/wms" && req.method === "GET") {
    const rows = db.prepare(`
      SELECT i.ItemUUID, i.MaterialNumber, i.Qty, i.BoxID, b.Location, i.WmsLink
      FROM items i JOIN boxes b ON b.BoxID = i.BoxID
    `).all();
    return sendJson(res, 200, { generatedAt: new Date().toISOString(), rows });
  }

  // Health
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(`Mediator up. Drop CSVs into ${INBOX_DIR}\n`);
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(HTTP_PORT, () => {
  console.log(`HTTP on http://localhost:${HTTP_PORT}`);
  console.log(`Watching CSV inbox: ${path.resolve(INBOX_DIR)}`);
});
