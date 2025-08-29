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
const { zplForItem, zplForBox, sendZpl } = require("./print");
const { pdfForBox, pdfForItem } = require("./labelpdf");

const actions = loadActions();

fs.mkdirSync(INBOX_DIR, { recursive: true });
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
const PREVIEW_DIR = path.join(__dirname, "public", "prints");
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

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

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Static files from /public (styles, icons)
    if (url.pathname === "/styles.css" && req.method === "GET") {
        const p = path.join(__dirname, "public", "styles.css");
        try {
            const css = fs.readFileSync(p);
            res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
            return res.end(css);
        } catch {
            res.writeHead(404); return res.end("Not found");
        }
    }

    if (url.pathname.startsWith("/prints/") && req.method === "GET") {
        const p = path.join(__dirname, "public", url.pathname);
        try {
            if (!p.startsWith(path.join(__dirname, "public", "prints"))) throw new Error("bad path");
            if (fs.existsSync(p)) {
                res.writeHead(200, { "Content-Type": "application/pdf" });
                return res.end(fs.readFileSync(p));
            }
        } catch { }
        res.writeHead(404); return res.end("Not found");
    }


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

    // Daten Eingabe (mobile + desktop)
    if (url.pathname === "/ui/import" && req.method === "GET") {
        const p = path.join(__dirname, "public", "import.html");
        if (fs.existsSync(p)) {
            const html = fs.readFileSync(p);
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(html);
        } else {
            res.writeHead(200, { "Content-Type": "text/plain" });
            return res.end(`Mediator up. Drop CSVs into ${INBOX_DIR}\n`);
        }
    }

    /* ---------------------- Box placement page -------------------- */
    if (url.pathname.startsWith("ui/box/") && req.method === "GET") {
        const id = decodeURIComponent(url.pathname.replace("/box/", ""));
        const box = getBox.get(id);
        if (!box) {
            res.writeHead(404);
            return res.end("Box not found");
        }
        const events = listEventsForBox.all(id);
        const html = `<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${box.BoxID} · Place Box</title>
<link rel="stylesheet" href="/styles.css" />
<body class="mobile">
  <div class="container stack">
    <h1>Box <span class="mono">${box.BoxID}</span></h1>
    <form class="card stack" method="post" action="/api/boxes/${encodeURIComponent(box.BoxID)}/place">
      <div>
        <h2>Set location</h2>
        <label>Location</label>
        <input name="location" value="${box.Location || ''}" required />
      </div>
      <div class="row">
        <input name="actor" placeholder="Your initials" />
        <button class="btn-primary" type="submit">Save placement</button>
      </div>
      <div>
        <label>Notes</label>
        <textarea name="notes" rows="3">${box.BoxNotes || ''}</textarea>
      </div>
    </form>

    <div class="card">
      <h2>Recent activity</h2>
      <div class="stack">
        ${events.map(e =>
            `<div>
             <div class="muted">${e.CreatedAt}</div>
             <div>${e.Event} ${e.Actor ? 'by ' + e.Actor : ''} ${e.Meta ? '— ' + e.Meta : ''}</div>
           </div>`).join('')}
      </div>
    </div>

    <a class="linkcard" href="/ui/box/${encodeURIComponent(box.BoxID)}">
      <div class="card">
        <h2>Action view</h2>
        <div class="muted mono">/ui/box/${box.BoxID}</div>
      </div>
    </a>
  </div>
</body>`;
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

    // single entry (Form-POST, urlencoded)
    if (url.pathname === "/ui/api/import/item" && req.method === "POST") {
        let body = ""; req.on("data", c => body += c);
        req.on("end", () => {
            const p = new URLSearchParams(body);
            const BoxID = (p.get("BoxID") || "").trim();
            let ItemUUID = (p.get("ItemUUID") || "").trim();
            if (!BoxID) return sendJson(res, 400, { error: "BoxID ist erforderlich." });
            if (!ItemUUID) {
                try { ItemUUID = require("crypto").randomUUID(); }
                catch { return sendJson(res, 400, { error: "ItemUUID fehlt und konnte nicht generiert werden." }); }
            }


            const now = new Date().toISOString();
            const data = {
                BoxID,
                ItemUUID,
                MaterialNumber: (p.get("MaterialNumber") || "").trim(),
                Description: (p.get("Description") || "").trim(),
                Condition: (p.get("Condition") || "").trim(),
                Qty: parseInt((p.get("Qty") || "1").trim(), 10) || 1,
                WmsLink: (p.get("WmsLink") || "").trim(),
                AttributesJson: (p.get("AttributesJson") || "").trim(),
                AddedAt: (p.get("AddedAt") || "").trim(),
                Location: (p.get("Location") || "").trim(),
                ItemNotes: (p.get("ItemNotes") || "").trim()
            };

            // upsert box + item
            db.prepare(`INSERT INTO boxes (BoxID, Location, CreatedAt, Notes, BoxNotes, PlacedBy, PlacedAt, UpdatedAt)
                VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?)
                ON CONFLICT(BoxID) DO UPDATE SET Location=excluded.Location, UpdatedAt=excluded.UpdatedAt`)
                .run(BoxID, data.Location || "", data.AddedAt || "", now);

            db.prepare(`INSERT INTO items (ItemUUID, BoxID, MaterialNumber, Description, Condition, Qty, WmsLink, AttributesJson, AddedAt, Location, ItemNotes, UpdatedAt)
                VALUES (@ItemUUID,@BoxID,@MaterialNumber,@Description,@Condition,@Qty,@WmsLink,@AttributesJson,@AddedAt,@Location,@ItemNotes,@UpdatedAt)
                ON CONFLICT(ItemUUID) DO UPDATE SET
                  BoxID=excluded.BoxID, MaterialNumber=excluded.MaterialNumber, Description=excluded.Description,
                  Condition=excluded.Condition, Qty=excluded.Qty, WmsLink=excluded.WmsLink,
                  AttributesJson=excluded.AttributesJson, AddedAt=COALESCE(excluded.AddedAt, items.AddedAt),
                  Location=excluded.Location, ItemNotes=COALESCE(excluded.ItemNotes, items.ItemNotes),
                  UpdatedAt=excluded.UpdatedAt`)
                .run({ ...data, UpdatedAt: now });

            logEvent.run({ Actor: null, EntityType: "Item", EntityId: ItemUUID, Event: "ManualCreateOrUpdate", Meta: JSON.stringify({ BoxID }) });

            return sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID } });
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
        }
        else {
            res.writeHead(400); return res.end("Bad entity type");
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
  <a class="linkcard" href="/"><div class="card">← Home</div></a>
`;
        const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${entity.type} ${entity.id}</title>
<link rel="stylesheet" href="/styles.css" />
<body class="mobile"><div class="container stack">${body}</div></body>`;

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);

    }

    /*---------------------------------------------------------------------------* 
    /*----------------------------   API   --------------------------------------* 
    /*---------------------------------------------------------------------------* 

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

    // CSV-Validierung (reine Prüfung, kein Import)
    if (url.pathname === "/api/validate-csv" && req.method === "POST") {
        let text = ""; req.on("data", c => text += c);
        req.on("end", async () => {
            try {
                const parse = require("csv-parse").parse;
                const rows = await new Promise((resolve, reject) => {
                    const arr = [];
                    parse(text, { columns: true, trim: true })
                        .on("data", r => arr.push(r))
                        .on("error", reject)
                        .on("end", () => resolve(arr));
                });

                // basic header/field checks
                const required = ["BoxID", "ItemUUID"];
                const bad = [];
                const boxes = new Set();
                rows.forEach((r, i) => {
                    required.forEach(k => {
                        if (!r[k] || String(r[k]).trim() === "") bad.push(`Zeile ${i + 2}: Feld ${k} fehlt`);
                    });
                    if (r.BoxID) boxes.add(String(r.BoxID).trim());
                    // JSON check (optional)
                    if (r.AttributesJson && r.AttributesJson.trim()) {
                        try { JSON.parse(r.AttributesJson); } catch (e) {
                            bad.push(`Zeile ${i + 2}: AttributesJson ist kein gültiges JSON`);
                        }
                    }
                });

                if (bad.length) return sendJson(res, 400, { error: "Validierung fehlgeschlagen", details: bad.slice(0, 10).join("\n") });
                return sendJson(res, 200, { ok: true, rows: rows.length, items: rows.length, boxes: Array.from(boxes) });
            } catch (e) {
                return sendJson(res, 400, { error: e.message });
            }
        });
        return;
    }

    /* ------------------------ QR redirect (item) ------------------- */
    // if (url.pathname.startsWith("/qr/")) {
    //     const uuid = decodeURIComponent(url.pathname.slice(4));
    //     const item = getItem.get(uuid);
    //     if (!item) {
    //         res.writeHead(404);
    //         return res.end("Not found");
    //     }
    //     if (item.WmsLink) {
    //         res.writeHead(302, { Location: item.WmsLink });
    //         return res.end();
    //     }
    //     return sendJson(res, 200, { message: "No WMS link; returning item", item });
    // }

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
    if (url.pathname.match(/^\/api\/item\/[^/]+\/move$/) && req.method === "POST") {
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

    // GET /api/test — send a test label or write preview PDF if not configured
    if (url.pathname === "/api/test" && req.method === "GET") {
        const zpl = `^XA
^CI28
^PW600^LL300
^FO30,30^A0N,48,48^FDTEST LABEL^FS
^FO30,100^A0N,32,32^FDMediator Print OK^FS
^FO30,160^BQN,2,6^FDLA,http://localhost:${HTTP_PORT}/^FS
^XZ`;
        try {
            const result = await sendZpl(zpl);
            if (result.sent) {
                logEvent.run({ Actor: null, EntityType: "System", EntityId: "Printer", Event: "TestPrinted", Meta: null });
                return sendJson(res, 200, { ok: true, sent: true });
            }
            // fallback preview
            const out = path.join(PREVIEW_DIR, `test-${Date.now()}.pdf`);
            await pdfForBox({ boxId: "TEST", location: "", url: `http://localhost:${HTTP_PORT}/`, outPath: out });
            const rel = `/prints/${path.basename(out)}`;
            logEvent.run({ Actor: null, EntityType: "System", EntityId: "Printer", Event: "TestPreviewSaved", Meta: JSON.stringify({ file: rel }) });
            return sendJson(res, 200, { ok: false, sent: false, previewUrl: rel, reason: result.reason || "not_configured" });
        } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message });
        }
    }

    // POST/GET /api/print/box/:boxId — send box label or create preview PDF
    if (url.pathname.startsWith("/api/print/box/") && (req.method === "POST" || req.method === "GET")) {
        const boxId = decodeURIComponent(url.pathname.replace("/api/print/box/", ""));
        const box = getBox.get(boxId);
        if (!box) return sendJson(res, 404, { error: "box not found" });

        try {
            const zpl = zplForBox({ boxId: box.BoxID, location: box.Location || "" });
            const result = await sendZpl(zpl);

            if (result.sent) {
                logEvent.run({ Actor: null, EntityType: "Box", EntityId: box.BoxID, Event: "PrintSent", Meta: JSON.stringify({ transport: "tcp" }) });
                return sendJson(res, 200, { ok: true, sent: true });
            }
            // Fallback to PDF preview
            const urlToUi = `http://localhost:${HTTP_PORT}/ui/box/${encodeURIComponent(box.BoxID)}`;
            const out = path.join(PREVIEW_DIR, `box-${box.BoxID}-${Date.now()}.pdf`.replace(/[^\w.\-]/g, "_"));
            await pdfForBox({ boxId: box.BoxID, location: box.Location || "", url: urlToUi, outPath: out });
            const rel = `/prints/${path.basename(out)}`;
            logEvent.run({ Actor: null, EntityType: "Box", EntityId: box.BoxID, Event: "PrintPreviewSaved", Meta: JSON.stringify({ file: rel }) });
            return sendJson(res, 200, { ok: false, sent: false, previewUrl: rel, reason: result.reason || "not_configured" });
        } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message });
        }
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
