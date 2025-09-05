import React, { useState } from 'react';
import type { Item } from '../../../models';

interface Props {
  item: Partial<Item>;
  onSubmit: (data: Partial<Item>) => Promise<void>;
  submitLabel: string;
  isNew?: boolean;
}

export default function ItemForm({ item, onSubmit, submitLabel, isNew }: Props) {
  const [form, setForm] = useState<Partial<Item>>({ ...item });

  function update<K extends keyof Item>(key: K, value: Item[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onSubmit(form);
    } catch (err) {
      console.error('Item form submit failed', err);
    }
  }

  async function generateMaterialNumber() {
    try {
      const res = await fetch('/api/getNewMaterialNumber');
      if (res.ok) {
        const j = await res.json();
        update('Artikel_Nummer', j.nextArtikelNummer);
      } else {
        console.error('Failed to get material number', res.status);
      }
    } catch (err) {
      console.error('Failed to get material number', err);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="item-form">
      <label>
        Box-ID
        <input value={form.BoxID || ''} readOnly placeholder="Eine neue Box wird angelegt" />
      </label>
      {form.ItemUUID && <input type="hidden" value={form.ItemUUID} />}
      <label>
        Artikelnummer
        <div className="combined-input">
          <input
            value={form.Artikel_Nummer || ''}
            onChange={(e) => update('Artikel_Nummer', e.target.value)}
            required
          />
          {isNew && (
            <button type="button" onClick={generateMaterialNumber}>
              neu?
            </button>
          )}
        </div>
      </label>
      <label>
        Artikelbeschreibung
        <input
          value={form.Artikelbeschreibung || ''}
          onChange={(e) => update('Artikelbeschreibung', e.target.value)}
          required
        />
      </label>
      <label>
        Auf Lager
        <input
          type="number"
          value={form.Auf_Lager ?? 0}
          onChange={(e) => update('Auf_Lager', parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Verkaufspreis (CHF)
        <input
          type="number"
          step="0.01"
          value={form.Verkaufspreis ?? 0}
          onChange={(e) => update('Verkaufspreis', parseFloat(e.target.value) || 0)}
        />
      </label>
      <label>
        Kurzbeschreibung
        <input
          value={form.Kurzbeschreibung || ''}
          onChange={(e) => update('Kurzbeschreibung', e.target.value)}
        />
      </label>
      <label>
        Langtext
        <textarea
          value={form.Langtext || ''}
          onChange={(e) => update('Langtext', e.target.value)}
          rows={3}
        />
      </label>
      <label>
        Hersteller
        <input
          value={form.Hersteller || ''}
          onChange={(e) => update('Hersteller', e.target.value)}
        />
      </label>
      <label>
        Länge (mm)
        <input
          type="number"
          value={form.Länge_mm ?? 0}
          onChange={(e) => update('Länge_mm', parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Breite (mm)
        <input
          type="number"
          value={form.Breite_mm ?? 0}
          onChange={(e) => update('Breite_mm', parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Höhe (mm)
        <input
          type="number"
          value={form.Höhe_mm ?? 0}
          onChange={(e) => update('Höhe_mm', parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Gewicht (kg)
        <input
          type="number"
          step="0.01"
          value={form.Gewicht_kg ?? 0}
          onChange={(e) => update('Gewicht_kg', parseFloat(e.target.value) || 0)}
        />
      </label>
      <label>
        Hauptkategorien A
        <input
          value={form.Hauptkategorien_A || ''}
          onChange={(e) => update('Hauptkategorien_A', e.target.value)}
        />
      </label>
      <label>
        Unterkategorien A
        <input
          value={form.Unterkategorien_A || ''}
          onChange={(e) => update('Unterkategorien_A', e.target.value)}
        />
      </label>
      <label>
        Hauptkategorien B
        <input
          value={form.Hauptkategorien_B || ''}
          onChange={(e) => update('Hauptkategorien_B', e.target.value)}
        />
      </label>
      <label>
        Unterkategorien B
        <input
          value={form.Unterkategorien_B || ''}
          onChange={(e) => update('Unterkategorien_B', e.target.value)}
        />
      </label>
      <label>
        Veröffentlicht Status
        <input
          value={form.Veröffentlicht_Status || ''}
          onChange={(e) => update('Veröffentlicht_Status', e.target.value)}
        />
      </label>
      <label>
        Shopartikel
        <input
          type="number"
          value={form.Shopartikel ?? 0}
          min={0}
          max={1}
          onChange={(e) => update('Shopartikel', parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Artikeltyp
        <input
          value={form.Artikeltyp || ''}
          onChange={(e) => update('Artikeltyp', e.target.value)}
        />
      </label>
      <label>
        Einheit
        <input
          value={form.Einheit || ''}
          onChange={(e) => update('Einheit', e.target.value)}
        />
      </label>
      <label>
        WMS Link
        <input
          value={form.WmsLink || ''}
          onChange={(e) => update('WmsLink', e.target.value)}
        />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
