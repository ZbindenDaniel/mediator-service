module.exports = {
  key: "edit",
  label: "Edit",
  order: 10,
  appliesTo: (entity) => true, // both Box and Item
  // Small HTML snippet (rendered as a modal-like card)
  view: (entity) => {
    const isBox = entity.type === "Box";
    const idLabel = isBox ? "BoxID" : "ItemUUID";
    return `
      <div class="card">
        <h3>Edit ${entity.type}</h3>
        <form method="post" action="/ui/api/${entity.type.toLowerCase()}/${encodeURIComponent(entity.id)}/edit">
          <input type="hidden" name="entityType" value="${entity.type}"/>
          <input type="hidden" name="id" value="${entity.id}"/>
          <label>${idLabel}</label>
          <input value="${entity.id}" disabled />
          ${isBox ? `
            <label>Location</label>
            <input name="Location" value="${entity.data.Location || ''}" />
            <label>Notes</label>
            <textarea name="BoxNotes" rows="3">${entity.data.BoxNotes || ''}</textarea>
          ` : `
            <label>MaterialNumber</label>
            <input name="MaterialNumber" value="${entity.data.MaterialNumber || ''}" />
            <label>Description</label>
            <input name="Description" value="${entity.data.Description || ''}" />
            <label>Condition</label>
            <input name="Condition" value="${entity.data.Condition || ''}" />
            <label>Qty</label>
            <input name="Qty" value="${entity.data.Qty || 0}" />
            <label>ItemNotes</label>
            <textarea name="ItemNotes" rows="3">${entity.data.ItemNotes || ''}</textarea>
          `}
          <div style="margin-top:8px"><button type="submit">Save</button></div>
        </form>
      </div>
    `;
  }
};
