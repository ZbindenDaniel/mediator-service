// actions/30-kivi.js
module.exports = {
  key: "kivi",
  label: "Kivi",
  order: 30,
  appliesTo: () => true,

  view: (entity) => {
    const q = encodeURIComponent(entity.id);
    const href = entity.type === "Item"
      ? `https://kivi.example/app?item=${q}`
      : `https://kivi.example/app?box=${q}`;
    return `
      <a href="${href}" target="_blank" rel="noopener" style="display:block">
        <div class="card" style="cursor:pointer">
          <h3>Open in Kivi</h3>
          <p class="muted mono">${href}</p>
        </div>
      </a>
    `;
  }
};
