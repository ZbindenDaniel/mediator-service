module.exports = {
  name: "validate",
  apply(row) {
    const errors = [];
    if (!row.ItemUUID) errors.push("ItemUUID missing");
    if (!row.BoxID) errors.push("BoxID missing");
    if (errors.length) return { ok: false, errors };
    return { ok: true, row };
  }
};
