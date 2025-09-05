// Decide whether to queue a label (e.g., always queue for demo)
module.exports = {
  name: "queue-label",
  apply(row, ctx) {
    ctx.queueLabel(row.ItemUUID);
    return { ok: true, row };
  }
};
