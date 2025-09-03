// actions/15-print-box.js
module.exports = {
  key: "print-box",
  label: "Print label",
  order: 15,
  appliesTo: (entity) => entity.type === "Box", Here we need one for Items
  view: (entity) => {
    const id = encodeURIComponent(entity.id);
    const statusId = `printBoxMsg-${id}`;

    return `
      <div class="card" style="cursor:pointer" onclick="printBoxLabel('${id}', '${statusId}')">
        <h3>Etikette drucken</h3>
        <div class="muted mono">/api/print/box/${id}</div>
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
              el.innerHTML = 'Kein Drucker konfiguriert. Vorschau erstellt: ' +
                '<a class="mono" href="'+j.previewUrl+'" target="_blank" rel="noopener">PDF öffnen</a>';
            } else {
              el.textContent = 'Fehler: ' + (j.error || j.reason || 'unbekannt');
            }
          } catch (e) {
            el.textContent = 'Fehler: ' + e.message;
          }
        }
      </script>
    `;
  }
};
