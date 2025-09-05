// Example mapper: normalize MaterialNumber, generate WmsLink if missing
module.exports = {
  name: "map-wms",
  apply(row) {
    row.MaterialNumber = (row.MaterialNumber || "").trim();
    if (!row.WmsLink && row.MaterialNumber) {
      row.WmsLink = `https://wms.example/items/${encodeURIComponent(row.MaterialNumber)}`;
    }
    return { ok: true, row };
  }
};
