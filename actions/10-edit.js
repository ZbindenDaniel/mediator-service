// actions/10-edit.js
// Renders item edits. For Box: lists items in the box (queried directly from DB).
// For Item: shows inline edit form.

const { itemsByBox } = require("../db"); // ← use DB prepared statement

function esc(s = "") {
  return s;
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = {
  key: "edit",
  label: "Edit",
  order: 10,
  appliesTo: () => true,

  view: (entity) => {
    if (entity.type === "Box") {
      // Subquery: fetch items for this BoxID
      let items = [];
      try { items = itemsByBox.all(entity.id) || []; } catch { items = []; }

      const list = items.length
        ? items.map(it => `
            <a class="linkcard" href="/ui/item/${encodeURIComponent(it.ItemUUID)}#act-edit">
              <div class="card" style="margin:6px 0">
                <div><b>${esc(it.MaterialNumber) || "(no material)"}</b>
                    · <span class="pill ${it.EntityType} mono">${esc((it.ItemUUID || "").slice(-6).toUpperCase())}</span></div>
                <div class="muted">${esc(it.Description) || ""}</div>
                <div class="muted">Qty: ${it.Qty ?? 0} · Cond: ${esc(it.Condition) || ""}</div>
              </div>
            </a>
          `).join("")
        : `<div class="muted">This box has no items (yet).</div>`;

      return `
        <div class="card">
          <h3>Edit items in this box</h3>
          <p class="muted">Open an item to change qty, description, condition or notes.</p>
          ${list}
          <div class="btn-container">
          <a id="btnAddItem" class="btn" href="/ui/import?box=${encodeURIComponent(entity.id)}"><button class="btn" data-boxid="${esc(entity.id)}">+</button></a>
          
          </div>
        </div>
      `;
    }

    // Item edit (inline form)
    const d = entity.data || {};
    console.log(entity.data)
    return `
      <div class="card">
        <h3>Edit Item</h3>
        <form method="post" action="/ui/api/item/${encodeURIComponent(entity.id)}/edit">
          <label>Artikelnummer</label>
          <input name="MaterialNumber" value="${esc(d.MaterialNumber) || ""}" />
          <label>Geräte-Name</label>
          <input name="Description" value="${esc(d.Description) || ""}" required />
          <label>Menge</label>
          <input name="Qty" value="${Number.isFinite(d.Qty) ? d.Qty : (parseInt(d.Qty || "0", 10) || 0)}" />
          <label>Notiz</label>
          <textarea name="ItemNotes" rows="3">${esc(d.ItemNotes) || ""}</textarea>
          <div style="margin-top:8px"><button type="submit">Save</button></div>
        </form>
      </div>
    `;
  }
};
