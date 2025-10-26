import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';
import ItemForm from './ItemForm';
import { ensureUser } from '../lib/user';
import ItemMediaGallery from './ItemMediaGallery';
import { useDialog } from './dialog';
import LoadingPage from './LoadingPage';

interface Props {
  itemId: string;
}

export default function ItemEdit({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const dialog = useDialog();

  const initialPhotos = useMemo(() => {
    try {
      const seen = new Set<string>();
      const primarySource = typeof item?.Grafikname === 'string' ? item.Grafikname.trim() : '';
      const ordered: string[] = [];

      const addPhoto = (candidate: unknown, isPrimary = false) => {
        if (typeof candidate !== 'string') {
          return;
        }
        const trimmed = candidate.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        if (isPrimary) {
          ordered.unshift(trimmed);
        } else {
          ordered.push(trimmed);
        }
      };

      addPhoto(primarySource, true);

      const secondary: string[] = [];
      for (const asset of mediaAssets) {
        if (typeof asset !== 'string') {
          continue;
        }
        const trimmed = asset.trim();
        if (!trimmed || trimmed === primarySource) {
          continue;
        }
        if (seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
        secondary.push(trimmed);
      }

      secondary.sort((a, b) => a.localeCompare(b));
      if (ordered.length > 0) {
        const [primary] = ordered;
        const result = [primary, ...secondary];
        console.log('Derived initial photo ordering for item edit', {
          itemId: item?.ItemUUID,
          photoCount: result.length
        });
        return result;
      }

      console.log('Derived initial photo ordering for item edit without primary asset', {
        itemId: item?.ItemUUID,
        photoCount: secondary.length
      });
      return secondary;
    } catch (error) {
      console.error('Failed to derive initial photo list for item edit form', error);
      return [];
    }
  }, [item?.Grafikname, mediaAssets]);

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
    if (saving) {
      console.warn('Item update already in progress; ignoring duplicate submit.');
      return;
    }
    const actor = await ensureUser();
    if (!actor) {
      console.info('Item edit aborted: missing username.');
      try {
        await dialog.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert while editing item', error);
      }
      return;
    }
    try {
      setSaving(true);
      console.log('Submitting item update', {
        itemId,
        changedFields: Object.keys(data || {})
      });
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, actor })
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
        try {
          await dialog.alert({
            title: 'Speichern fehlgeschlagen',
            message: 'Der Artikel konnte nicht gespeichert werden. Bitte versuche es später erneut.'
          });
        } catch (alertError) {
          console.error('Failed to display save failure dialog', alertError);
        }
      }
    } catch (err) {
      console.error('Failed to save item', err);
      try {
        await dialog.alert({
          title: 'Speichern fehlgeschlagen',
          message: 'Beim Speichern des Artikels ist ein Fehler aufgetreten.'
        });
      } catch (alertError) {
        console.error('Failed to display save exception dialog', alertError);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!item) return <p>Loading...</p>;

  const blockingOverlay = saving ? (
    <div className="blocking-overlay" role="presentation">
      <div className="blocking-overlay__surface" role="dialog" aria-modal="true" aria-live="assertive">
        <LoadingPage message="Änderungen werden gespeichert…" />
      </div>
    </div>
  ) : null;

  const gallery = (
    <section className="item-media-section">
      <h3>Medien</h3>
      <ItemMediaGallery itemId={item.ItemUUID} grafikname={item.Grafikname} mediaAssets={mediaAssets} />
    </section>
  );

  return (
    <>
      {blockingOverlay}
      <ItemForm
        item={item}
        onSubmit={handleSubmit}
        submitLabel="Speichern"
        headerContent={gallery}
        initialPhotos={initialPhotos}
      />
    </>
  );
}
