import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';
import ItemForm from './ItemForm';
import { getUser } from '../lib/user';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemMediaGallery from './ItemMediaGallery';

interface Props {
  itemId: string;
}

export default function ItemEdit({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          const media = Array.isArray(data.media)
            ? data.media.filter((src: unknown): src is string => typeof src === 'string' && src.trim() !== '')
            : [];
          setMediaAssets(media);
        } else {
          console.error('Failed to load item', res.status);
          setMediaAssets([]);
        }
      } catch (err) {
        console.error('Failed to load item', err);
        setMediaAssets([]);
      }
    }
    load();
  }, [itemId]);

  async function handleSubmit(data: Partial<Item>) {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, actor: getUser() })
      });
      if (res.ok) {
        const payload = await res
          .json()
          .catch((err) => {
            console.error('Failed to parse save item response', err);
            return null;
          });
        if (payload && Array.isArray(payload.media)) {
          const media = payload.media.filter((src: unknown): src is string => typeof src === 'string' && src.trim() !== '');
          setMediaAssets(media);
        }
        navigate(`/items/${encodeURIComponent(itemId)}`);
      } else {
        console.error('Failed to save item', res.status);
      }
    } catch (err) {
      console.error('Failed to save item', err);
    }
  }

  if (!item) return <p>Loading...</p>;

  const existingMediaFiles = useMemo(() => {
    try {
      const seen = new Set<string>();
      const filenames: string[] = [];
      const addSource = (src: unknown) => {
        if (typeof src !== 'string') {
          return;
        }
        const trimmed = src.trim();
        if (!trimmed) {
          return;
        }
        const fileName = trimmed.split('/').pop() || trimmed;
        if (seen.has(fileName)) {
          return;
        }
        seen.add(fileName);
        filenames.push(fileName);
      };
      addSource(item.Grafikname);
      mediaAssets.forEach(addSource);
      return filenames;
    } catch (err) {
      console.error('Failed to derive existing media filenames for edit form', err);
      return [];
    }
  }, [item.Grafikname, mediaAssets]);

  const gallery = (
    <section className="item-media-section">
      <h3>Medien</h3>
      <ItemMediaGallery itemId={item.ItemUUID} grafikname={item.Grafikname} mediaAssets={mediaAssets} />
    </section>
  );

  return (
    <ItemForm
      item={item}
      onSubmit={handleSubmit}
      submitLabel="Speichern"
      headerContent={gallery}
      existingMediaFiles={existingMediaFiles}
    />
  );
}
