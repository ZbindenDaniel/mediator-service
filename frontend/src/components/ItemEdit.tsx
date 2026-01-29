import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGENTIC_RUN_ACTIVE_STATUSES, normalizeAgenticRunStatus } from '../../../models';
import type { ItemReferenceEdit } from '../../../models';
// TODO(agentic-edit-lock): Add a read-only fallback view when edits are blocked by active agentic runs.
// TODO(reference-only-edit): Ensure item edit continues to submit reference-only payloads.
// TODO(einheit-immutability): Keep Einheit immutable for existing item edits to avoid reference drift.
// TODO(optional-photos): Confirm edit form photo initialization after removing the media gallery.
import ItemForm from './ItemForm';
import { ensureUser } from '../lib/user';
import { useDialog } from './dialog';
import LoadingPage from './LoadingPage';
import { logger } from '../utils/logger';
import { extractReferenceFields, ItemFormPayload } from './forms/itemFormShared';

// TODO(edit-quality-stock): Revisit whether admins should regain edit access to Quality/Auf_Lager once roles are defined.

interface Props {
  itemId: string;
}

function stripInstanceFieldsForEdit(itemId: string, data: Partial<ItemFormPayload>) {
  const cleaned = { ...data };
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
  const immutableReferenceFields = ['Einheit', 'Suchbegriff'] as const;
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
  const removedReferenceFields = immutableReferenceFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(data, field)
  );
  if (removedReferenceFields.length > 0) {
    try {
      logger.warn?.('Item edit payload contained immutable reference fields; stripping before submit', {
        itemId,
        removedFields: removedReferenceFields
      });
    } catch (error) {
      console.error('Failed to log stripped immutable edit fields', error);
    }
  }
  removedReferenceFields.forEach((field) => {
    delete (cleaned as Partial<ItemFormPayload>)[field];
  });
  return extractReferenceFields(cleaned);
}

export default function ItemEdit({ itemId }: Props) {
  const [item, setItem] = useState<ItemReferenceEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const dialog = useDialog();

  const initialPhotos = useMemo(() => {
    try {
      const primarySource = typeof item?.Grafikname === 'string' ? item.Grafikname.trim() : '';
      if (primarySource) {
        console.log('Derived initial photo ordering for item edit', {
          itemId,
          photoCount: 1
        });
        return [primarySource];
      }

      console.log('Derived initial photo ordering for item edit without primary asset', {
        itemId,
        photoCount: 0
      });
      return [];
    } catch (error) {
      console.error('Failed to derive initial photo list for item edit form', error);
      return [];
    }
  }, [item?.Grafikname, itemId]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          const nextItem = data?.item ?? null;
          if (!nextItem) {
            console.error('Failed to load item: empty payload', { itemId });
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
        } else {
          console.error('Failed to load item', res.status);
        }
      } catch (err) {
        console.error('Failed to load item', err);
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

  return (
    <>
      {blockingOverlay}
      <ItemForm
        item={item}
        onSubmit={handleSubmit}
        submitLabel="Speichern"
        initialPhotos={initialPhotos}
        lockedFields={{ Auf_Lager: 'hidden', Quality: 'hidden', BoxID: 'hidden', Einheit: 'hidden' }}
        hidePhotoInputs
        formMode="reference"
      />
    </>
  );
}
