import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';
import ItemForm from './ItemForm';

interface Props {
  itemId: string;
}

export default function ItemEdit({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
        } else {
          console.error('Failed to load item', res.status);
        }
      } catch (err) {
        console.error('Failed to load item', err);
      }
    }
    load();
  }, [itemId]);

  async function handleSubmit(data: Partial<Item>) {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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

  if (!item) return <p>Loading...</p>;

  return <ItemForm item={item} onSubmit={handleSubmit} submitLabel="Speichern" />;
}
