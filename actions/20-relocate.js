// actions/20-relocate.js
module.exports = {
  key: "relocate",
  label: "Relocate",
  order: 20,
  appliesTo: () => true,

  view: (entity) => {
    if (entity.type === "Box") {
      const href = `ui/box/${encodeURIComponent(entity.id)}`;
      return `
        <a href="${href}" style="display:block">
          <div class="card" style="cursor:pointer">
            <h3>Relocate / Place Box</h3>
            <p class="muted">Open the placement page to set or update the box location.</p>
            <div class="muted mono">${href}</div>
          </div>
        </a>
      `;
    }

    // Item relocate (keep inline form)
    return `
      <div class="card">
        <a id="relocate"></a>
        <h3><a href="#relocate">Relocate Item</a></h3>
        <form method="post" action="/ui/api/item/${encodeURIComponent(entity.id)}/move">
          <label>Destination BoxID</label>
          <input name="toBoxId" placeholder="BOX-YYYY-NNNN" required />
          <label>Your name</label>
          <input name="actor" placeholder="Initials or name" />
          <div style="margin-top:8px"><button type="submit">Move</button></div>
        </form>
      </div>
    `;
  }
};
