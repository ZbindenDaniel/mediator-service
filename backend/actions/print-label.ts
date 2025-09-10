import { Entity } from '../../models';
import type { Action } from './index';

const action: Action = {
  key: 'print-label',
  label: 'Print label',
  appliesTo: (entity: Entity) => entity.type === 'Box' || entity.type === 'Item',
  view: (entity: Entity) => {
    const id = encodeURIComponent(entity.id);
    const statusId = `printBoxMsg-${id}`;

    return `
      <div class="card" style="cursor:pointer" onclick="printBoxLabel('${id}', '${statusId}')">
        <h3>Etikette drucken</h3>
        <div id="${statusId}" class="muted" style="margin-top:6px"></div>
      </div>

      <script>
        async function printBoxLabel(boxId, statusId) {
          const el = document.getElementById(statusId);
          if (!el) return;
          el.textContent = 'Drucke…';
          try {
            const r = await fetch('/api/print/box/' + boxId, { method: 'POST' });
            const j = await r.json().catch(()=>({}));
            if (r.ok && j.sent) {
              el.textContent = 'Gesendet an Drucker.';
            } else if (r.ok && j.previewUrl) {
              // TODO: sanitize previewUrl before injecting to avoid XSS
              el.innerHTML = 'Kein Drucker konfiguriert. Vorschau erstellt: ' +
                '<a class="mono" href="'+j.previewUrl+'" target="_blank" rel="noopener">PDF öffnen</a>';
            } else {
              el.textContent = 'Fehler: ' + (j.error || j.reason || 'unbekannt');
            }
          } catch (e: any) {
            el.textContent = 'Fehler: ' + e.message;
          }
        }
      </script>
    `;
  }
};

export default action;
