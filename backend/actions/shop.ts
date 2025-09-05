import { Entity } from '../../models';

const action = {
  key: 'shop',
  label: 'Shop',
  appliesTo: (e: Entity) => e.type === 'Item',
  view: (entity: Entity & { MaterialNumber?: string }): string => {
    const href = `https://shop.revamp-it.ch/search?search=${encodeURIComponent(entity.MaterialNumber || '')}`;
    return `
      <div class="card" style="cursor:pointer;display:flex;align-items:center;gap:10px" onclick="window.open('${href}','_blank','noopener')">
        <div style="font-size:22px">🛒</div>
        <div>
          <h3>Open Shop</h3>
          <div class="muted mono">${(entity.id || '').slice(-6).toUpperCase()}</div>
        </div>
      </div>
    `;
  }
};

export default action;
