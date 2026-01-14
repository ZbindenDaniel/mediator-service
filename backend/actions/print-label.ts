import { Entity } from '../../models';
import type { Action } from './index';

const action: Action = {
  key: 'print-label',
  label: 'Print label',
  appliesTo: (entity: Entity) => entity.type === 'Box' || entity.type === 'Item',
  view: (entity: Entity) => {
    const id = encodeURIComponent(entity.id);
    const statusId = `printBoxMsg-${id}`;
    // TODO(agent): Align legacy print label UI with actor + labelType payload requirements.
    // TODO(agent): Keep print-label endpoints in sync with print-box/item route regex.
    const endpoint =
      entity.type === 'Box'
        ? `/api/print/box/${id}`
        : entity.type === 'Item'
          ? `/api/print/item/${id}`
          : '';

    return `
      <div class="card" style="cursor:pointer" onclick="printBoxLabel('${id}', '${statusId}')">
        <h3>Etikette drucken</h3>
        <div id="${statusId}" class="muted" style="margin-top:6px"></div>
      </div>

      <script>
        const endpoint = '${endpoint}';
        const entityType = '${entity.type}';
        const labelType = entityType === 'Box' ? 'box' : entityType === 'Item' ? 'item' : entityType === 'Shelf' ? 'shelf' : '';

        async function printBoxLabel(boxId, statusId) {
          const el = document.getElementById(statusId);
          if (!el) return;
          el.textContent = 'Drucke…';
          try {
            if (!boxId) {
              console.warn('Print label called without an entity id', { entityType });
              el.textContent = 'Fehler: Ungültige ID.';
              return;
            }
            if (!endpoint) {
              console.warn('Print label called with unexpected entity type', { entityType, boxId });
              el.textContent = 'Fehler: Unbekannter Typ.';
              return;
            }
            if (!labelType) {
              console.warn('Print label called without labelType', { entityType, boxId });
              el.textContent = 'Fehler: Ungültiger Typ.';
              return;
            }
            const actor = resolveActor();
            if (!actor) {
              console.warn('Print label called without actor', { boxId, labelType });
              el.textContent = 'Fehler: Benutzername fehlt.';
              return;
            }
            let r;
            try {
              r = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actor, labelType })
              });
            } catch (fetchErr) {
              console.error('Print label request failed', { boxId, labelType, fetchErr });
              el.textContent = 'Fehler: Netzwerkproblem.';
              return;
            }
            let j = {};
            try {
              j = await r.json();
            } catch (parseErr) {
              console.error('Failed to parse print label response', { boxId, labelType, parseErr });
            }
            if (r.ok && j.sent) {
              el.textContent = 'Gesendet an Drucker.';
            } else if (r.ok && j.previewUrl) {
              const safePreviewUrl = sanitizePreviewUrl(j.previewUrl);
              if (!safePreviewUrl) {
                console.error('Rejected unsafe previewUrl for print preview', { boxId, previewUrl: j.previewUrl });
                el.textContent = 'Fehler: Vorschau konnte nicht sicher erstellt werden.';
                return;
              }

              const link = document.createElement('a');
              link.className = 'mono';
              link.href = safePreviewUrl;
              link.target = '_blank';
              link.rel = 'noopener';
              link.textContent = 'HTML öffnen';

              el.textContent = 'Kein Drucker konfiguriert. Vorschau erstellt: ';
              el.appendChild(link);
            } else {
              el.textContent = 'Fehler: ' + (j.error || j.reason || 'unbekannt');
            }
          } catch (e) {
            console.error('Print label request failed unexpectedly', { boxId, labelType, e });
            el.textContent = 'Fehler: ' + (e && e.message ? e.message : 'unbekannt');
          }
        }

        function resolveActor() {
          try {
            const stored = localStorage.getItem('username') || '';
            const trimmed = stored.trim();
            if (trimmed) return trimmed;
          } catch (storageErr) {
            console.warn('Failed to read actor from localStorage', storageErr);
          }

          const prompted = window.prompt('Benutzername');
          const trimmedPrompt = (prompted || '').trim();
          if (!trimmedPrompt) return '';
          try {
            localStorage.setItem('username', trimmedPrompt);
          } catch (storageErr) {
            console.warn('Failed to persist actor to localStorage', storageErr);
          }
          return trimmedPrompt;
        }

        // TODO: move sanitizePreviewUrl to a shared helper if other actions need preview sanitization
        function sanitizePreviewUrl(rawUrl) {
          if (typeof rawUrl !== 'string') return null;
          const trimmed = rawUrl.trim();
          if (!trimmed) return null;
          try {
            const url = new URL(trimmed, window.location.origin);
            const allowedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
            const sameOrigin = url.origin === window.location.origin;
            const relativePath = trimmed.startsWith('/');
            if (!allowedProtocol || (!sameOrigin && !relativePath)) return null;
            return relativePath ? url.pathname + url.search + url.hash : url.href;
          } catch (parseErr) {
            console.error('Failed to parse previewUrl for sanitization', { boxId, rawUrl, parseErr });
            return null;
          }
        }
      </script>
    `;
  }
};

export default action;
