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
    <div className='container item'>
      <div className="card">
        <form onSubmit={handleSubmit} className="item-form">
          <input value={form.BoxID || ''} readOnly hidden />

          <div className="row">
            <label>
              Artikelbeschreibung*
            </label>
            <input
              value={form.Artikelbeschreibung || ''}
              onChange={(e) => update('Artikelbeschreibung', e.target.value)}
              required
            />
          </div>

          <div className="row">
            {form.ItemUUID && <label>
              Box-ID
            </label>}
            {form.ItemUUID && <input type="hidden" value={form.ItemUUID} />}
            <label>
              Artikelnummer*
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
          </div>

          <div className="row">
            <label>
              Anzahl*
            </label>
            {isNew ? (
              <input
                type="number"
                value={form.Auf_Lager ?? 0}
                onChange={(e) => update('Auf_Lager', parseInt(e.target.value, 10) || 0)}
                required
              />
            ) : (
              <input type="number" value={form.Auf_Lager ?? 0} readOnly required />
            )}
          </div>

          <div className="row">
            <label>
              Kurzbeschreibung
            </label>
            <input
              value={form.Kurzbeschreibung || ''}
              onChange={(e) => update('Kurzbeschreibung', e.target.value)}
            />
          </div>

          <div className="row">
            <label>
              Langtext
            </label>
            <textarea
              value={form.Langtext || ''}
              onChange={(e) => update('Langtext', e.target.value)}
              rows={3}
            />
          </div>

          <div className="row">
            <label>
              Hersteller
            </label>
            <input
              value={form.Hersteller || ''}
              onChange={(e) => update('Hersteller', e.target.value)}
            />
          </div>
          <div className="row">
            <label>
              Länge (mm)
            </label>
            <input
              type="number"
              value={form.Länge_mm ?? 0}
              onChange={(e) => update('Länge_mm', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="row">
            <label>
              Breite (mm)
            </label>
            <input
              type="number"
              value={form.Breite_mm ?? 0}
              onChange={(e) => update('Breite_mm', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="row">
            <label>
              Höhe (mm)
            </label>
            <input
              type="number"
              value={form.Höhe_mm ?? 0}
              onChange={(e) => update('Höhe_mm', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="row">
            <label>
              Gewicht (kg)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.Gewicht_kg ?? 0}
              onChange={(e) => update('Gewicht_kg', parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="row">
            <label>
              Verkaufspreis (CHF)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.Verkaufspreis ?? 0}
              onChange={(e) => update('Verkaufspreis', parseFloat(e.target.value) || 0)}
            />
          </div>

          <hr></hr>

          <div className="row">
            <label>
              Hauptkategorien A
            </label>
            <input
              value={form.Hauptkategorien_A || ''}
              onChange={(e) => update('Hauptkategorien_A', e.target.value)}
            />
          </div>
          <div className="row">
            <label>
              Unterkategorien A
            </label>
            <input
              value={form.Unterkategorien_A || ''}
              onChange={(e) => update('Unterkategorien_A', e.target.value)}
            />
          </div>
          <div className="row">
            <label>
              Hauptkategorien B
            </label>
            <input
              value={form.Hauptkategorien_B || ''}
              onChange={(e) => update('Hauptkategorien_B', e.target.value)}
            />
          </div>
          <div className="row">
            <label>
              Unterkategorien B
            </label>
            <input
              value={form.Unterkategorien_B || ''}
              onChange={(e) => update('Unterkategorien_B', e.target.value)}
            />
          </div>

          <hr></hr>
          {/* 
          <div className="row">
            <label>
              Veröffentlicht Status
            </label>
            <input
              value={form.Veröffentlicht_Status || ''}
              onChange={(e) => update('Veröffentlicht_Status', e.target.value)}
            />
          </div>
          <div className="row">
            <label>
              Shopartikel
            </label>
            <input
              type="number"
              value={form.Shopartikel ?? 0}
              min={0}
              max={1}
              onChange={(e) => update('Shopartikel', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          
          <div className="row">
            <label>
              Artikeltyp
            </label>
            <input
              value={form.Artikeltyp || ''}
              onChange={(e) => update('Artikeltyp', e.target.value)}
            />
          </div> */}

          <div className="row">
            <label>
              Einheit
            </label>
            <input
              value={form.Einheit || ''}
              onChange={(e) => update('Einheit', e.target.value)}
            />
          </div>

          <div className="row">
            <label>
              Kivi-Link
            </label>
            <input
              value={form.WmsLink || ''}
              onChange={(e) => update('WmsLink', e.target.value)}
            />
          </div>

          {/* https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture */}
          <div className="row">
            <label>
              Foto 1*
            </label>
            <input
              type="file"
              id="picture1"
              name="picture1"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => update('picture1', e.target.files?.[0] || null)}
            />
          </div>

          {form.picture1 && (
            <div className="row">
              <label>
                Foto 2
              </label>
              <input
                type="file"
                id="picture2"
                name="picture2"
                accept="image/*"
                capture="environment"
                onChange={(e) => update('picture2', e.target.files?.[0] || null)}
              />
            </div>
          )}

          {form.picture2 && (
            <div className="row">
              <label>
                Foto 3
              </label>
              <input
                type="file"
                id="picture3"
                name="picture3"
                accept="image/*"
                capture="environment"
                onChange={(e) => update('picture3', e.target.files?.[0] || null)}
              />
            </div>
          )}

          <div className="row">
            <button type="submit">{submitLabel}</button>
          </div>
        </form >
      </div>
    </div>
  );
}
