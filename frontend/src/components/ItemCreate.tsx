import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import ItemForm from './ItemForm';
import { getUser } from '../lib/user';
import ItemForm_Agentic from './ItemForm_agentic';

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || null;

  async function handleSubmit(data: Partial<Item>) {
    const p = new URLSearchParams();
    Object.entries({ ...data, BoxID: boxId || data.BoxID || '', actor: getUser() }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        p.append(k, String(v));
      }
    });
    try {
      const res = await fetch('/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });
      if (res.ok) {
        const j = await res.json();
        alert('Behälter erstellt. Bitte platzieren!');
        navigate(`/boxes/${encodeURIComponent(j.item.BoxID)}`);
      } else {
        console.error('Failed to create item', res.status);
      }
    } catch (err) {
      console.error('Failed to create item', err);
    }
  }

  return <ItemForm_Agentic item={{ BoxID: boxId }} onSubmit={handleSubmit} submitLabel="Speichern" isNew />;
}
