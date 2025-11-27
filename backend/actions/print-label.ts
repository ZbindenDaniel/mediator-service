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
              link.textContent = 'PDF öffnen';

              el.textContent = 'Kein Drucker konfiguriert. Vorschau erstellt: ';
              el.appendChild(link);
            } else {
              el.textContent = 'Fehler: ' + (j.error || j.reason || 'unbekannt');
            }
          } catch (e: any) {
            el.textContent = 'Fehler: ' + e.message;
          }
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
