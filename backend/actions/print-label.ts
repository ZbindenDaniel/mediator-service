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
          el.textContent = 'Bereite Etikett vor…';
          try {
            const r = await fetch('/api/print/box/' + boxId, { method: 'POST' });
            const j = await r.json().catch(()=>({}));
            if (r.ok && j.template && j.payload) {
              const key = `print:payload:${Date.now()}:${Math.random().toString(16).slice(2)}`;
              try {
                sessionStorage.setItem(key, JSON.stringify(j.payload));
                window.open(j.template + '?key=' + encodeURIComponent(key), '_blank', 'noopener');
                el.textContent = 'Vorlage geöffnet.';
              } catch (storageErr) {
                console.error('Failed to cache print payload', storageErr);
                el.textContent = 'Fehler: Zwischenspeichern nicht möglich';
              }
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
