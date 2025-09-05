import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';

interface Props {
  itemId: string;
}

export default function ItemEdit({ itemId }: Props) {
  const [form, setForm] = useState<Item | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          setForm(data.item);
        } else {
          console.error('Failed to load item', res.status);
        }
      } catch (err) {
        console.error('Failed to load item', err);
      }
    }
    load();
  }, [itemId]);

  function update<K extends keyof Item>(key: K, value: Item[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        navigate(`/items/${encodeURIComponent(itemId)}`);
      } else {
        console.error('Failed to save item', res.status);
      }
    } catch (err) {
      console.error('Failed to save item', err);
    }
  }

  if (!form) return <p>Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="item-edit">
      <h2>Edit Item</h2>
      <label>
        Artikelnummer
        <input
          value={form.Artikel_Nummer || ''}
          onChange={(e) => update('Artikel_Nummer', e.target.value)}
        />
      </label>
      <label>
        Beschreibung
        <input
          value={form.Artikelbeschreibung || ''}
          onChange={(e) => update('Artikelbeschreibung', e.target.value)}
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
      <button type="submit">Speichern</button>
    </form>
  );
}
