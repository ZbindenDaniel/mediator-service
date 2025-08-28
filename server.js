// server.js
const fs = require("fs");
const path = require("path");
const http = require("http");
const chokidar = require("chokidar");
const { loadActions } = require("./actions");
const { HTTP_PORT, INBOX_DIR, ARCHIVE_DIR } = require("./config");
const { ingestCsvFile } = require("./importer");
const {
    db,
    getItem,
    findByMaterial,
    itemsByBox,
    getBox,
    listBoxes,
    nextLabelJob,
    updateLabelJobStatus,
    logEvent,
    listEventsForBox,
    listEventsForItem,
    listRecentEvents,
    countBoxes,
    countItems,
    countItemsNoWms,
    listRecentBoxes
} = require("./db");
const { zplForItem, sendZpl } = require("./print");

const actions = loadActions();

fs.mkdirSync(INBOX_DIR, { recursive: true });
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

/* ----------------------- CSV watcher / ingestion ----------------------- */

async function handleCsv(absPath) {
    try {
        const { count, boxes } = await ingestCsvFile(absPath);
        const archived = path.join(
            ARCHIVE_DIR,
            path.basename(absPath).replace(/\.csv$/i, `.${Date.now()}.csv`)
        );
        fs.renameSync(absPath, archived);
        console.log(
            `Ingested ${count} rows from ${path.basename(absPath)} → boxes: ${boxes.join(", ")}`
        );
    } catch (e) {
        console.error(`Failed ingest ${absPath}:`, e.message);
    }
}

chokidar
    .watch(INBOX_DIR, {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 250 }
    })
    .on("add", (p) => p.endsWith(".csv") && handleCsv(p))
    .on("change", (p) => p.endsWith(".csv") && handleCsv(p));

/* --------------------------- Print worker ------------------------------ */

async function runPrintWorker() {
    const job = nextLabelJob.get();
    if (!job) return;
    try {
        const item = getItem.get(job.ItemUUID);
        if (!item) {
            updateLabelJobStatus.run("Error", "item not found", job.Id);
            return;
        }
        const zpl = zplForItem({
            materialNumber: item.MaterialNumber,
            itemUUID: item.ItemUUID
        });
        await sendZpl(zpl);
        updateLabelJobStatus.run("Done", null, job.Id);
    } catch (e) {
        updateLabelJobStatus.run("Error", e.message, job.Id);
    }
}
setInterval(runPrintWorker, 750);

/* ------------------------------- HTTP ---------------------------------- */

function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

function pageShell(title, bodyHtml) {
    return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:16px;line-height:1.45}
.wrap{max-width:860px;margin:0 auto}
h1{margin:.2em 0 .6em}
.card{border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0}
button,input,textarea{font:inherit;padding:8px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#f1f1f1;font-size:.9em}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
a{text-decoration:none}
</style>
<div class="wrap">
${bodyHtml}
</div>`;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    /* -------- Landing (serve public/index.html if present) -------- */
    if (url.pathname === "/" && req.method === "GET") {
        const p = path.join(__dirname, "public", "index.html");
        if (fs.existsSync(p)) {
            const html = fs.readFileSync(p);
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(html);
        } else {
            res.writeHead(200, { "Content-Type": "text/plain" });
            return res.end(`Mediator up. Drop CSVs into ${INBOX_DIR}\n`);
        }
    }

    /* ---------------------- CSV import via HTTP ------------------- */
    // Headers: Content-Type: text/plain, X-Filename: name.csv
    if (url.pathname === "/api/import" && req.method === "POST") {
        let name = (req.headers["x-filename"] || "upload.csv").toString().replace(/[^\w.\-]/g, "_");
        if (!name.toLowerCase().endsWith(".csv")) name += ".csv";
        const tmpPath = path.join(INBOX_DIR, `${Date.now()}_${name}`);
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
            try {
                fs.writeFileSync(tmpPath, body, "utf8");
                // watcher will ingest it asynchronously
                return sendJson(res, 200, { ok: true, message: `Saved to inbox as ${path.basename(tmpPath)}` });
            } catch (e) {
                return sendJson(res, 500, { error: e.message });
            }
        });
        return;
    }

    /* ---------------------- Box placement page -------------------- */
    if (url.pathname.startsWith("/box/") && req.method === "GET") {
        const id = decodeURIComponent(url.pathname.replace("/box/", ""));
        const box = getBox.get(id);
        if (!box) {
            res.writeHead(404);
            return res.end("Box not found");
        }
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
    ${events.map(e => `<li class="ev">${e.CreatedAt} — ${e.Event} ${e.Actor ? 'by ' + e.Actor : ''} ${e.Meta ? ' (' + e.Meta + ')' : ''}</li>`).join('')}
  </ul>
  <p><a href="/ui/box/${encodeURIComponent(box.BoxID)}">Open action view →</a></p>
</div>`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
    }

    /* ------------------- Place box (set location) ----------------- */
    if (url.pathname.match(/^\/api\/boxes\/[^/]+\/place$/) && req.method === "POST") {
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const box = getBox.get(id);
        if (!box) {
            res.writeHead(404);
            return res.end("Box not found");
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            const params = new URLSearchParams(body);
            const location = (params.get("location") || "").trim();
            const actor = (params.get("actor") || "").trim();
            const notes = (params.get("notes") || "").trim();

            db.prepare(
                `UPDATE boxes SET Location=?, BoxNotes=?, PlacedBy=?, PlacedAt=datetime('now'), UpdatedAt=datetime('now') WHERE BoxID=?`
            ).run(location, notes, actor, id);

            const meta = JSON.stringify({ location, notes });
            logEvent.run({
                Actor: actor || null,
                EntityType: "Box",
                EntityId: id,
                Event: "Placed",
                Meta: meta
            });

            res.writeHead(302, { Location: `/box/${encodeURIComponent(id)}` });
            res.end();
        });
        return;
    }

    /* ------------------------ QR redirect (item) ------------------- */
    if (url.pathname.startsWith("/qr/")) {
        const uuid = decodeURIComponent(url.pathname.slice(4));
        const item = getItem.get(uuid);
        if (!item) {
            res.writeHead(404);
            return res.end("Not found");
        }
        if (item.WmsLink) {
            res.writeHead(302, { Location: item.WmsLink });
            return res.end();
        }
        return sendJson(res, 200, { message: "No WMS link; returning item", item });
    }

    /* ---------------------------- APIs ----------------------------- */

    // List boxes
    if (url.pathname === "/api/boxes" && req.method === "GET") {
        return sendJson(res, 200, listBoxes.all());
    }

    // Box detail
    if (url.pathname.startsWith("/api/boxes/") && req.method === "GET") {
        const id = decodeURIComponent(url.pathname.replace("/api/boxes/", ""));
        const box = getBox.get(id);
        if (!box) return sendJson(res, 404, { error: "not found" });
        return sendJson(res, 200, {
            box,
            items: itemsByBox.all(id),
            events: listEventsForBox.all(id)
        });
    }

    // Search by material
    if (url.pathname === "/api/search" && req.method === "GET") {
        const material = url.searchParams.get("material") || "";
        if (!material) return sendJson(res, 400, { error: "material query is required" });
        return sendJson(res, 200, { items: findByMaterial.all(material) });
    }

    // Item detail
    if (url.pathname.startsWith("/api/items/") && req.method === "GET") {
        const uuid = decodeURIComponent(url.pathname.replace("/api/items/", ""));
        const item = getItem.get(uuid);
        if (!item) return sendJson(res, 404, { error: "not found" });
        const box = getBox.get(item.BoxID);
        return sendJson(res, 200, { item, box, events: listEventsForItem.all(uuid) });
    }

    // Update item note
    if (url.pathname.match(/^\/api\/items\/[^/]+\/note$/) && req.method === "POST") {
        const uuid = decodeURIComponent(url.pathname.split("/")[3]);
        const item = getItem.get(uuid);
        if (!item) return sendJson(res, 404, { error: "not found" });

        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            const { note, actor } = JSON.parse(body || "{}");
            db.prepare(`UPDATE items SET ItemNotes=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(
                note || "",
                uuid
            );
            logEvent.run({
                Actor: actor || null,
                EntityType: "Item",
                EntityId: uuid,
                Event: "Note",
                Meta: JSON.stringify({ note })
            });
            sendJson(res, 200, { ok: true });
        });
        return;
    }

    // Move item between boxes
    if (url.pathname.match(/^\/api\/items\/[^/]+\/move$/) && req.method === "POST") {
        const uuid = decodeURIComponent(url.pathname.split("/")[3]);
        const item = getItem.get(uuid);
        if (!item) return sendJson(res, 404, { error: "not found" });

        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            const { toBoxId, actor } = JSON.parse(body || "{}");
            if (!toBoxId) return sendJson(res, 400, { error: "toBoxId required" });
            const dest = getBox.get(toBoxId);
            if (!dest) return sendJson(res, 404, { error: "destination box not found" });

            db.prepare(`UPDATE items SET BoxID=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(
                toBoxId,
                uuid
            );
            logEvent.run({
                Actor: actor || null,
                EntityType: "Item",
                EntityId: uuid,
                Event: "Moved",
                Meta: JSON.stringify({ from: item.BoxID, to: toBoxId })
            });
            sendJson(res, 200, { ok: true });
        });
        return;
    }

    // Export snapshot for WMS
    if (url.pathname === "/api/export/wms" && req.method === "GET") {
        const rows = db
            .prepare(
                `SELECT i.ItemUUID, i.MaterialNumber, i.Qty, i.BoxID, b.Location, i.WmsLink
         FROM items i JOIN boxes b ON b.BoxID = i.BoxID`
            )
            .all();
        return sendJson(res, 200, { generatedAt: new Date().toISOString(), rows });
    }

    // API: overview (counts + recent boxes + recent events)
    if (url.pathname === "/api/overview" && req.method === "GET") {
        const counts = {
            boxes: countBoxes.get().c,
            items: countItems.get().c,
            itemsNoWms: countItemsNoWms.get().c
        };
        const recentBoxes = listRecentBoxes.all();
        const recentEvents = listRecentEvents.all();
        return sendJson(res, 200, { counts, recentBoxes, recentEvents });
    }

    /* ------------------- Dynamic Action View (/ui) ----------------- */

    if (url.pathname.startsWith("/ui/")) {
        const parts = url.pathname.split("/").filter(Boolean); // [ 'ui', 'box'|'item', ':id' ]
        const kind = (parts[1] || "").toLowerCase();
        const id = decodeURIComponent(parts.slice(2).join("/"));
        let entity = null;

        if (kind === "box") {
            const box = getBox.get(id);
            if (!box) { res.writeHead(404); return res.end("Box not found"); }
            const boxItems = itemsByBox.all(box.BoxID); // ← add items for box
            entity = { type: "Box", id: box.BoxID, data: box, items: boxItems };
        } else if (kind === "item") {
            const item = getItem.get(id);
            if (!item) { res.writeHead(404); return res.end("Item not found"); }
            entity = { type: "Item", id: item.ItemUUID, data: item };
        } else {
            res.writeHead(400); return res.end("Bad entity type");
        }

        if (kind === "box") {
            const box = getBox.get(id);
            if (!box) {
                res.writeHead(404);
                return res.end("Box not found");
            }
            entity = { type: "Box", id: box.BoxID, data: box };
        } else if (kind === "item") {
            const item = getItem.get(id);
            if (!item) {
                res.writeHead(404);
                return res.end("Item not found");
            }
            entity = { type: "Item", id: item.ItemUUID, data: item };
        } else {
            res.writeHead(400);
            return res.end("Bad entity type");
        }

        const available = actions.filter(a => {
            try { return typeof a.appliesTo === "function" ? a.appliesTo(entity) : true; }
            catch { return false; }
        });

        const cards = available.map(a => {
            try { return `<a id="act-${a.key}"></a>${a.view(entity)}`; }
            catch (e) {
                return `<div class="card"><h3>${a.label}</h3><p class="muted">Render error: ${e.message}</p></div>`;
            }
        }).join("");

        const body = `
  <h1>${entity.type}: <span class="mono">${entity.id}</span></h1>
  ${cards}
  <p><a href="/">← Home</a></p>
`;
        const html = pageShell(`${entity.type} ${entity.id}`, body);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
    }

    /* --------------- UI action form endpoints (/ui/api) ------------ */

    // Edit (box/item)
    if (url.pathname.match(/^\/ui\/api\/(box|item)\/[^/]+\/edit$/) && req.method === "POST") {
        const [, , type, rawId] = url.pathname.split("/");
        const id = decodeURIComponent(rawId);
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            const p = new URLSearchParams(body);
            if (type === "box") {
                const loc = (p.get("Location") || "").trim();
                const notes = (p.get("BoxNotes") || "").trim();
                db.prepare(`UPDATE boxes SET Location=?, BoxNotes=?, UpdatedAt=datetime('now') WHERE BoxID=?`)
                    .run(loc, notes, id);
                logEvent.run({
                    Actor: null,
                    EntityType: "Box",
                    EntityId: id,
                    Event: "Edit",
                    Meta: JSON.stringify({ Location: loc, BoxNotes: notes })
                });
                res.writeHead(302, { Location: `/ui/box/${encodeURIComponent(id)}#act-edit` });
                return res.end();
            } else {
                const mat = (p.get("MaterialNumber") || "").trim();
                const desc = (p.get("Description") || "").trim();
                const cond = (p.get("Condition") || "").trim();
                const qty = parseInt((p.get("Qty") || "0").trim(), 10) || 0;
                const note = (p.get("ItemNotes") || "").trim();
                db.prepare(
                    `UPDATE items SET MaterialNumber=?, Description=?, Condition=?, Qty=?, ItemNotes=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`
                ).run(mat, desc, cond, qty, note, id);
                logEvent.run({
                    Actor: null,
                    EntityType: "Item",
                    EntityId: id,
                    Event: "Edit",
                    Meta: JSON.stringify({ MaterialNumber: mat, Qty: qty })
                });
                res.writeHead(302, { Location: `/ui/item/${encodeURIComponent(id)}#act-edit` });
                return res.end();
            }
        });
        return;
    }

    // Relocate (item) from UI
    if (url.pathname.match(/^\/ui\/api\/item\/[^/]+\/move$/) && req.method === "POST") {
        const uuid = decodeURIComponent(url.pathname.split("/")[4]);
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            // Accept urlencoded OR JSON
            let toBoxId = "",
                actor = "";
            try {
                const p = new URLSearchParams(body);
                toBoxId = (p.get("toBoxId") || "").trim();
                actor = (p.get("actor") || "").trim();
            } catch { }
            if (!toBoxId) {
                try {
                    const j = JSON.parse(body || "{}");
                    toBoxId = j.toBoxId || "";
                    actor = j.actor || "";
                } catch { }
            }
            if (!toBoxId) {
                res.writeHead(400);
                return res.end("toBoxId required");
            }
            const item = getItem.get(uuid);
            if (!item) {
                res.writeHead(404);
                return res.end("item not found");
            }
            const dest = getBox.get(toBoxId);
            if (!dest) {
                res.writeHead(404);
                return res.end("destination box not found");
            }
            db.prepare(`UPDATE items SET BoxID=?, UpdatedAt=datetime('now') WHERE ItemUUID=?`).run(
                toBoxId,
                uuid
            );
            logEvent.run({
                Actor: actor || null,
                EntityType: "Item",
                EntityId: uuid,
                Event: "Moved",
                Meta: JSON.stringify({ from: item.BoxID, to: toBoxId })
            });
            res.writeHead(302, { Location: `/ui/item/${encodeURIComponent(uuid)}#act-relocate` });
            res.end();
        });
        return;
    }

    /* ----------------------- Not found fallback -------------------- */
    res.writeHead(404);
    res.end("Not found");
});

/* ----------------------------- Start ----------------------------- */

server.listen(HTTP_PORT, () => {
    console.log(`HTTP on http://localhost:${HTTP_PORT}`);
    console.log(`Watching CSV inbox: ${path.resolve(INBOX_DIR)}`);
});
