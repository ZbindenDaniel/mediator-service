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
      if (!res.ok) {
        console.error('Failed to create item', res.status);
        throw new Error(`Failed to create item. Status: ${res.status}`);
      }

      const j = await res.json();
      const createdItem: Item | undefined = j?.item;

      const searchText = createdItem?.Artikelbeschreibung || data.Artikelbeschreibung || '';
      const agenticPayload = {
        id: createdItem?.ItemUUID,
        search: searchText
      };

      void (async () => {
        try {
          if (!agenticPayload.id) {
            console.warn('Agentic trigger skipped: missing ItemUUID');
            return;
          }

          if (!agenticPayload.search) {
            console.warn('Agentic trigger skipped: missing search term');
            return;
          }

          const agenticRes = await fetch('http://localhost:3000/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agenticPayload)
          });

          if (!agenticRes.ok) {
            console.error('Agentic trigger failed', agenticRes.status);
          }
        } catch (agenticErr) {
          console.error('Agentic trigger invocation failed', agenticErr);
        }
      })();

      alert('Behälter erstellt. Bitte platzieren!');
      if (createdItem?.BoxID) {
        navigate(`/boxes/${encodeURIComponent(createdItem.BoxID)}`);
      }
    } catch (err) {
      console.error('Failed to create item', err);
      throw err;
    }
  }

  return <ItemForm_Agentic item={{ BoxID: boxId }} onSubmit={handleSubmit} submitLabel="Speichern" isNew />;
}
