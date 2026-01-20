import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGENTIC_RUN_ACTIVE_STATUSES, normalizeAgenticRunStatus } from '../../../models';
import type { ItemReferenceEdit } from '../../../models';
// TODO(agentic-edit-lock): Add a read-only fallback view when edits are blocked by active agentic runs.
// TODO(reference-only-edit): Ensure item edit continues to submit reference-only payloads.
import ItemForm from './ItemForm';
import { ensureUser } from '../lib/user';
import ItemMediaGallery from './ItemMediaGallery';
import { useDialog } from './dialog';
import LoadingPage from './LoadingPage';
import { logger } from '../utils/logger';
import { extractReferenceFields, ItemFormPayload } from './forms/itemFormShared';

// TODO(edit-quality-stock): Revisit whether admins should regain edit access to Quality/Auf_Lager once roles are defined.

interface Props {
  itemId: string;
}

function stripInstanceFieldsForEdit(itemId: string, data: Partial<ItemFormPayload>) {
  const instanceFields = [
    'BoxID',
    'Location',
    'UpdatedAt',
    'Datum_erfasst',
    'Auf_Lager',
    'Quality',
    'ShopwareVariantId',
    'ItemUUID'
  ] as const;
  const removedFields = instanceFields.filter((field) => Object.prototype.hasOwnProperty.call(data, field));
  if (removedFields.length > 0) {
    try {
      logger.warn?.('Item edit payload contained instance fields; stripping before submit', {
        itemId,
        removedFields
      });
    } catch (error) {
      console.error('Failed to log stripped edit fields', error);
    }
  }
  return extractReferenceFields(data);
}

export default function ItemEdit({ itemId }: Props) {
  const [item, setItem] = useState<ItemReferenceEdit | null>(null);
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
          itemId,
          photoCount: result.length
        });
        return result;
      }

      console.log('Derived initial photo ordering for item edit without primary asset', {
        itemId,
        photoCount: secondary.length
      });
      return secondary;
    } catch (error) {
      console.error('Failed to derive initial photo list for item edit form', error);
      return [];
    }
  }, [item?.Grafikname, itemId, mediaAssets]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          const nextItem = data?.item ?? null;
          if (!nextItem) {
            console.error('Failed to load item: empty payload', { itemId });
            setMediaAssets([]);
            return;
          }
          const agenticStatus = typeof nextItem.AgenticStatus === 'string'
            ? normalizeAgenticRunStatus(nextItem.AgenticStatus)
            : null;
          const agenticActive = agenticStatus ? AGENTIC_RUN_ACTIVE_STATUSES.has(agenticStatus) : false;
          if (agenticActive) {
            logger.info?.('Blocking item edit because agentic run is active', {
              itemId,
              status: agenticStatus
            });
            try {
              await dialog.alert({
                title: 'Bearbeiten nicht möglich',
                message: 'Während eines laufenden KI-Laufs kann der Artikel nicht bearbeitet werden.'
              });
            } catch (error) {
              console.error('Failed to display agentic edit block alert', error);
            }
            navigate(`/items/${encodeURIComponent(itemId)}`);
            return;
          }
          const referenceFields = extractReferenceFields(nextItem);
          const artikelNummer = typeof nextItem.Artikel_Nummer === 'string' ? nextItem.Artikel_Nummer.trim() : '';
          if (!artikelNummer) {
            console.error('Item edit missing Artikel_Nummer; cannot build reference payload', { itemId });
          }
          setItem({
            ...referenceFields,
            Artikel_Nummer: artikelNummer || referenceFields.Artikel_Nummer || ''
          });
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

  async function handleSubmit(data: Partial<ItemFormPayload>) {
    if (saving) {
      console.warn('Item update already in progress; ignoring duplicate submit.');
      return;
    }
    let sanitizedData: Partial<ItemReferenceEdit> = {};
    try {
      sanitizedData = stripInstanceFieldsForEdit(itemId, data ?? {});
    } catch (error) {
      console.error('Failed to sanitize item edit payload', error);
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
        changedFields: Object.keys(sanitizedData || {})
      });
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sanitizedData, actor })
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
      <ItemMediaGallery itemId={itemId} grafikname={item.Grafikname} mediaAssets={mediaAssets} />
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
        lockedFields={{ Auf_Lager: 'hidden', Quality: 'hidden', BoxID: 'hidden' }}
        hidePhotoInputs
        formMode="reference"
      />
    </>
  );
}
