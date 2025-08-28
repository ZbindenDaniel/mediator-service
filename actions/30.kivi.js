module.exports = {
  key: "kivi",
  label: "Kivi",
  order: 30,
  appliesTo: (entity) => true,
  // Render a simple button linking out (open in new tab)
  view: (entity) => {
    // Example target; adjust to your real Kivi URL scheme:
    // For Items: pass ItemUUID, for Boxes: pass BoxID
    const q = encodeURIComponent(entity.id);
    const href = entity.type === "Item"
      ? `https://kivi.example/app?item=${q}`
      : `https://kivi.example/app?box=${q}`;
    return `
      <div class="card">
        <h3>Open in Kivi</h3>
        <a href="${href}" target="_blank" rel="noopener">
          <button type="button">Open Kivi</button>
        </a>
      </div>
    `;
  }
};
