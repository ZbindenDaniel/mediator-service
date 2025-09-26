import { Entity } from '../../models';
import type { Action } from './index';

const action: Action = {
  key: 'print-label',
  label: 'Print label',
  appliesTo: (entity: Entity) => entity.type === 'Box' || entity.type === 'Item',
  view: (entity: Entity) => {
    const encodedId = encodeURIComponent(entity.id);
    const safeIdSegment =
      entity.id.replace(/[^a-zA-Z0-9_-]/g, '-') || Math.random().toString(16).slice(2);
    const statusId = `printLabelMsg-${safeIdSegment}`;
    const heading =
      entity.type === 'Item' ? 'Artikel-Etikett drucken' : 'Behälter-Etikett drucken';

    return `
      <div class="card" style="cursor:pointer" onclick="printEntityLabel('${entity.type}', '${encodedId}', '${statusId}')">
        <h3>${heading}</h3>
        <div id="${statusId}" class="muted" style="margin-top:6px"></div>
      </div>

      <script>
        window.printEntityLabel = window.printEntityLabel || async function printEntityLabel(entityType, encodedId, statusId) {
          const statusEl = document.getElementById(statusId);
          if (!statusEl) return;
          statusEl.textContent = 'Bereite Etikett vor…';
          const endpoint = entityType === 'Item' ? '/api/print/item/' : '/api/print/box/';
          try {
            const res = await fetch(endpoint + encodedId, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.template && data.payload) {
              let key = null;
              try {
                key = 'print:payload:' + Date.now() + ':' + Math.random().toString(16).slice(2);
                sessionStorage.setItem(key, JSON.stringify(data.payload));
              } catch (storageErr) {
                console.error('Failed to cache print payload', storageErr);
                key = null;
              }
              const target = key ? data.template + '?key=' + encodeURIComponent(key) : data.template;
              const win = window.open(target, '_blank', 'noopener');
              if (!win) {
                if (key) sessionStorage.removeItem(key);
                statusEl.textContent = 'Pop-ups blockiert? Bitte erlauben, um Etikett zu öffnen.';
                return;
              }
              const origin = window.location.origin;
              const message = { payload: data.payload };
              const post = () => {
                if (win.closed) return;
                try { win.postMessage(message, origin); }
                catch (postErr) {
                  console.error('Failed to send print payload via postMessage', postErr);
                }
              };
              setTimeout(post, 100);
              setTimeout(post, 500);
              try { win.focus(); }
              catch (focusErr) { console.warn('Unable to focus print window', focusErr); }
              statusEl.textContent = key
                ? 'Vorlage geöffnet. Bitte Druckdialog nutzen.'
                : 'Vorlage geöffnet. Daten wurden direkt übertragen.';
            } else {
              statusEl.textContent = 'Fehler: ' + (data.error || data.reason || ('HTTP ' + res.status));
            }
          } catch (err) {
            console.error('Print label failed', err);
            statusEl.textContent = 'Fehler: ' + (err && err.message ? err.message : 'unbekannter Fehler');
          }
        };
      </script>
    `;
  }
};

export default action;
