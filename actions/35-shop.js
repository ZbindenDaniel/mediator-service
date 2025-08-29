module.exports = {
  key: "shop",
  label: "Shop",
  order: 35,
  appliesTo: (e) => e.type === "Item",
  view: (entity) => {
    const href = `https://shop.example/product?uuid=${encodeURIComponent(entity.id)}`;
    return `
      <div class="card" style="cursor:pointer;display:flex;align-items:center;gap:10px" onclick="window.open('${href}','_blank','noopener')">
        <div style="font-size:22px">🛒</div>
        <div>
          <h3>Open Shop</h3>
          <div class="muted mono">${(entity.id||'').slice(-6).toUpperCase()}</div>
        </div>
      </div>
    `;
  }
};
