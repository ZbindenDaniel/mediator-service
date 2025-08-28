// actions/index.js
const fs = require("fs");
const path = require("path");

function normalizeAction(mod, filename) {
  const a = (mod && typeof mod === "object") ? mod : {};
  const key   = typeof a.key === "string" ? a.key : path.basename(filename, ".js");
  const label = typeof a.label === "string" ? a.label : key;
  const order = Number.isFinite(a.order) ? a.order : 100;
  const appliesTo = typeof a.appliesTo === "function" ? a.appliesTo : () => true;
  const view = typeof a.view === "function"
    ? a.view
    : (entity) => `<div class="card"><h3>${label}</h3><p class="muted">No view implemented for ${key}.</p></div>`;
  return { key, label, order, appliesTo, view };
}

function loadActions() {
  const dir = __dirname;
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".js") && f !== "index.js")
    .map(f => {
      const full = path.join(dir, f);
      try {
        const mod = require(full);
        return normalizeAction(mod, f);
      } catch (e) {
        // If a module fails to load, wrap it in a stub so the UI still works
        return normalizeAction({
          key: path.basename(f, ".js"),
          label: `Broken: ${f}`,
          view: () => `<div class="card"><h3>${f}</h3><p class="muted">Failed to load: ${e.message}</p></div>`
        }, f);
      }
    })
    .sort((a, b) => (a.order || 100) - (b.order || 100));
}

module.exports = { loadActions };
