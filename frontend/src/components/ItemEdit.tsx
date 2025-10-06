import React, { useEffect, useState } from 'react';
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
      <ItemForm item={item} onSubmit={handleSubmit} submitLabel="Speichern" headerContent={gallery} />
    </>
  );
}
