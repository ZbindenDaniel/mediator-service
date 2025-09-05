import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import ItemForm from './ItemForm';

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || '';

  async function handleSubmit(data: Partial<Item>) {
    const p = new URLSearchParams();
    Object.entries({ ...data, BoxID: boxId || data.BoxID || '' }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        p.append(k, String(v));
      }
    });
    try {
      const res = await fetch('/ui/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });
      if (res.ok) {
        const j = await res.json();
        navigate(`/items/${encodeURIComponent(j.item.ItemUUID)}`);
      } else {
        console.error('Failed to create item', res.status);
      }
    } catch (err) {
      console.error('Failed to create item', err);
    }
  }

  return <ItemForm item={{ BoxID: boxId }} onSubmit={handleSubmit} submitLabel="Speichern" isNew />;
}
