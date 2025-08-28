const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");
const { upsertBox, upsertItem, queueLabel } = require("./db");

function loadOps() {
  const dir = path.join(__dirname, "ops");
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".js"))
    .sort()
    .map(f => require(path.join(dir, f)));
}

const ops = loadOps();

function applyOps(row) {
  const ctx = {
    queueLabel: (itemUUID) => queueLabel.run(itemUUID),
    log: (...a) => console.log("[ops]", ...a)
  };
  let current = row;
  for (const op of ops) {
    const res = op.apply({ ...current }, ctx);
    if (!res || res.ok === false) {
      const errs = (res && res.errors) ? res.errors.join("; ") : "unknown";
      throw new Error(`Op ${op.name} failed: ${errs}`);
    }
    current = res.row || current;
  }
  return current;
}

async function ingestCsvFile(absPath) {
  const now = new Date().toISOString();
  const records = await readCsv(absPath);
  let count = 0;
  const boxesTouched = new Set();

  for (const r of records) {
    const row = normalize(r);
    const final = applyOps(row);

    upsertBox.run({
      BoxID: final.BoxID,
      Location: final.Location || "",
      CreatedAt: final.CreatedAt || "",
      Notes: final.Notes || "",
      BoxNotes: final.BoxNotes || "",
      PlacedBy: final.PlacedBy || "",
      PlacedAt: final.PlacedAt || "",
      UpdatedAt: now
    });
    upsertItem.run({
      ItemUUID: final.ItemUUID,
      BoxID: final.BoxID,
      MaterialNumber: final.MaterialNumber || "",
      Description: final.Description || "",
      Condition: final.Condition || "",
      Qty: parseInt(final.Qty || "0", 10) || 0,
      WmsLink: final.WmsLink || "",
      AttributesJson: final.AttributesJson || "",
      AddedAt: final.AddedAt || "",
      Location: final.Location || "",
      ItemNotes: final.ItemNotes || "",
      UpdatedAt: now
    });

    boxesTouched.add(final.BoxID);
    count++;
  }

  return { count, boxes: Array.from(boxesTouched) };
}

function normalize(r) {
  const o = {};
  for (const k of Object.keys(r)) o[k] = String(r[k] ?? "").trim();
  return o;
}

function readCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file)
      .pipe(parse({ columns: true, trim: true }))
      .on("data", (d) => rows.push(d))
      .on("error", reject)
      .on("end", () => resolve(rows));
  });
}

module.exports = { ingestCsvFile };
