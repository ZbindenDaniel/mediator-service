import { Entity } from '../../models';

const action = {
  key: 'kivi',
  label: 'Kivi',
  appliesTo: () => true,
  view: (entity: Entity): string => {
    const q = encodeURIComponent(entity.id);
    const href =
      entity.type === 'Item'
        ? `https://kivi.example/app?item=${q}`
        : `https://kivi.example/app?box=${q}`;
    return `
      <div class="card" style="cursor:pointer;display:flex;align-items:center;gap:10px" onclick="window.open('${href}','_blank','noopener')">
        <div style="font-size:22px">🔗</div>
        <div>
          <h3>Open Kivi</h3>
          <div class="muted mono">${entity.type}</div>
        </div>
      </div>
    `;
  }
};

export default action;
