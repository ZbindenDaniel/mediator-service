// actions/10-edit.ts
// Renders item edits. For Box: lists items in the box (queried directly from DB).
// For Item: shows inline edit form.

import { itemsByBox } from '../db';
import { Entity, Item } from '../../models';

function esc(s: string = ''): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const action = {
  key: 'edit',
  label: 'Edit',
  order: 10,
  appliesTo: () => true,

  view: (entity: Entity): string => {
    if (entity.type === 'Box') {
      // Subquery: fetch items for this BoxID
      let items: Item[] = [];
      try {
        items = (itemsByBox.all(entity.id) as Item[]) || [];
      } catch (err) {
        console.error('Failed to list items for box', entity.id, err);
        items = [];
      }

      const list = items.length
        ? items
            .map(
              (it) => `
            <a class="linkcard" href="/ui/item/${encodeURIComponent(it.ItemUUID)}#act-edit">
              <div class="card" style="margin:6px 0">
                <div>
                  <b>${esc(it.Artikel_Nummer) || '(keine Artikelnummer)'}</b>
                  <span class="pill ${it.EntityType} mono">${esc(
                    (it.ItemUUID || '').slice(-6).toUpperCase()
                  )}</span>
                </div>
                <div class="muted">${esc(it.Artikelbeschreibung) || ''}</div>
                <div class="muted">Auf Lager: ${it.Auf_Lager ?? 0}</div>
              </div>
            </a>
          `
            )
            .join('')
        : `<div class="muted">Diese Box enthält noch keine Artikel.</div>`;

      return `
        <div class="card">
          <h3>Items in dieser Box bearbeiten</h3>
          <p class="muted">Öffne ein Item, um Felder wie Artikelnummer, Beschreibung oder Lagerbestand zu ändern.</p>
          ${list}
          <div class="btn-container">
          <a id="btnAddItem" class="btn" href="/ui/import?box=${encodeURIComponent(
            entity.id
          )}"><button class="btn" data-boxid="${esc(entity.id)}">+</button></a>
          </div>
        </div>
      `;
    }

    // Item edit (inline form)
    const d: any = entity.data || {};
    return `
      <div class="card">
        <h3>Item bearbeiten</h3>
        <form method="post" action="/ui/api/item/${encodeURIComponent(entity.id)}/edit">
        <input name="ItemUUID" value="${esc(d.ItemUUID) || ''}" hidden/>
        <input name="BoxID" value="${esc(d.BoxID) || ''}" hidden/>
        <input name="Location" value="${esc(d.Location) || ''}" hidden/>

          <div class="row">
            <label>Artikelnummer</label>
            <input name="Artikel_Nummer" value="${esc(d.Artikel_Nummer) || ''}" />
          </div>
          <div class="row">
            <label>Artikelbeschreibung</label>
            <input name="Artikelbeschreibung" value="${esc(d.Artikelbeschreibung) || ''}" required />
          </div>
          <div class="row">
            <label>Auf Lager</label>
            <input name="Auf_Lager" type="number" value="${
              Number.isFinite(d.Auf_Lager) ? d.Auf_Lager : parseInt(d.Auf_Lager || '0', 10) || 0
            }" />
          </div>
          <div class="row">
            <label>Kurzbeschreibung</label>
            <input name="Kurzbeschreibung" value="${esc(d.Kurzbeschreibung) || ''}" />
          </div>
          <div class="row">
            <label>Langtext</label>
            <textarea name="Langtext" rows="3">${esc(d.Langtext) || ''}</textarea>
          </div>
          <div class="row">
            <label>Hersteller</label>
            <input name="Hersteller" value="${esc(d.Hersteller) || ''}" />
          </div>
          <div class="row">
            <label>Länge (mm)</label>
            <input name="Länge_mm" type="number" value="${
              Number.isFinite(d.Länge_mm) ? d.Länge_mm : parseInt(d.Länge_mm || '0', 10) || 0
            }" />
          </div>
          <div class="row">
            <label>Breite (mm)</label>
            <input name="Breite_mm" type="number" value="${
              Number.isFinite(d.Breite_mm) ? d.Breite_mm : parseInt(d.Breite_mm || '0', 10) || 0
            }" />
          </div>
          <div class="row">
            <label>Höhe (mm)</label>
            <input name="Höhe_mm" type="number" value="${
              Number.isFinite(d.Höhe_mm) ? d.Höhe_mm : parseInt(d.Höhe_mm || '0', 10) || 0
            }" />
          </div>
          <div class="row">
            <label>Gewicht (kg)</label>
            <input name="Gewicht_kg" type="number" step="0.01" value="${
              Number.isFinite(d.Gewicht_kg)
                ? d.Gewicht_kg
                : parseFloat(d.Gewicht_kg || '0') || 0
            }" />
          </div>
          <div class="row">
            <label>Hauptkategorien A</label>
            <input name="Hauptkategorien_A" value="${esc(d.Hauptkategorien_A) || ''}" />
          </div>
          <div class="row">
            <label>Unterkategorien A</label>
            <input name="Unterkategorien_A" value="${esc(d.Unterkategorien_A) || ''}" />
          </div>
          <div class="row">
            <label>Hauptkategorien B</label>
            <input name="Hauptkategorien_B" value="${esc(d.Hauptkategorien_B) || ''}" />
          </div>
          <div class="row">
            <label>Unterkategorien B</label>
            <input name="Unterkategorien_B" value="${esc(d.Unterkategorien_B) || ''}" />
          </div>
          <div class="row">
            <label>Veröffentlicht Status</label>
            <input name="Veröffentlicht_Status" value="${esc(d.Veröffentlicht_Status) || ''}" />
          </div>
          <div class="row">
            <label>Shopartikel</label>
            <input name="Shopartikel" type="number" min="0" max="1" value="${
              Number.isFinite(d.Shopartikel)
                ? d.Shopartikel
                : parseInt(d.Shopartikel || '0', 10) || 0
            }" />
          </div>
          <div class="row">
            <label>Artikeltyp</label>
            <input name="Artikeltyp" value="${esc(d.Artikeltyp) || ''}" />
          </div>
          <div class="row">
            <label>Einheit</label>
            <input name="Einheit" value="${esc(d.Einheit) || ''}" />
          </div>
          <div class="row">
            <label>WMS Link</label>
            <input name="WmsLink" value="${esc(d.WmsLink) || ''}" />
          </div>
          <div class="row">
          <div style="margin-top:8px">
          <button type="submit">Speichern</button>
          <button type="">Löschen</button>
          </div>
          </div>
        </form>
      </div>
    `;
  }
};

export default action;

