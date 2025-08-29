// actions/20-relocate.js
module.exports = {
  key: "relocate",
  label: "Relocate",
  order: 20,
  appliesTo: () => true,

  view: (entity) => {
    if (entity.type === "Box") {
      const href = `${encodeURIComponent(entity.id)}`;
      return `
       <div class="card">
        <a id="relocate"></a>
        <h3><a href="#relocate">Relocate Box</a></h3>
        <form method="post" action="/api/box/${encodeURIComponent(entity.id)}/move">
          <label>Ort</label>
          <input name="toBoxId" placeholder="A-01-02" required />
          <label>Your name</label>
          <input name="actor" placeholder="Initials or name" />
          <div style="margin-top:8px"><button type="submit">Move</button></div>
        </form>
      </div>
      `;
    }

    // Item relocate (keep inline form)
    return `
      <div class="card">
        <a id="relocate"></a>
        <h3><a href="#relocate">Relocate Item</a></h3>
        <form method="post" action="/api/item/${encodeURIComponent(entity.id)}/move">
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
