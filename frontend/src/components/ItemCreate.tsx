import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';
import ItemForm_Agentic from './ItemForm_agentic';

type ItemFormData = Item & {
  picture1?: string | null;
  picture2?: string | null;
  picture3?: string | null;
};

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || null;
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [itemUUID, setItemUUID] = useState<string | undefined>();

  const baseDraft = useMemo(
    () => ({
      ...draft,
      BoxID: draft.BoxID || boxId || undefined,
      ItemUUID: itemUUID || draft.ItemUUID
    }),
    [boxId, draft, itemUUID]
  );

  async function handleSubmit(data: Partial<ItemFormData>) {
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

  async function handleSubmitDetails(data: Partial<ItemFormData>) {
    console.log('Submitting step 1 item details', data);
    const detailPayload = {
      Artikelbeschreibung: data.Artikelbeschreibung,
      Artikel_Nummer: data.Artikel_Nummer,
      Auf_Lager: data.Auf_Lager,
      BoxID: data.BoxID || boxId || undefined
    } satisfies Partial<ItemFormData>;

    const p = new URLSearchParams();
    Object.entries({ ...detailPayload, actor: getUser() }).forEach(([k, v]) => {
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
        console.error('Failed to create item during step 1', res.status);
        throw new Error(`Failed to create item. Status: ${res.status}`);
      }

      const j = await res.json();
      const createdItem: Item | undefined = j?.item;

      setDraft((prev) => ({
        ...prev,
        ...detailPayload,
        BoxID: createdItem?.BoxID || detailPayload.BoxID,
        ItemUUID: createdItem?.ItemUUID || prev.ItemUUID
      }));
      setItemUUID(createdItem?.ItemUUID || itemUUID);

      const searchText = createdItem?.Artikelbeschreibung || detailPayload.Artikelbeschreibung || '';
      const agenticPayload = {
        id: createdItem?.ItemUUID,
        search: searchText
      };

      try {
        if (!agenticPayload.id) {
          console.warn('Agentic trigger skipped: missing ItemUUID');
        } else if (!agenticPayload.search) {
          console.warn('Agentic trigger skipped: missing search term');
        } else {
          const agenticRes = await fetch('http://localhost:3000/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agenticPayload)
          });

          if (!agenticRes.ok) {
            console.error('Agentic trigger failed', agenticRes.status);
          }
        }
      } catch (agenticErr) {
        console.error('Agentic trigger invocation failed', agenticErr);
      }

      setStep(2);
    } catch (err) {
      console.error('Failed to submit step 1 item details', err);
      throw err;
    }
  }

  async function handleSubmitPhotos(data: Partial<ItemFormData>) {
    console.log('Submitting step 2 item photos', data);
    const mergedData: Partial<ItemFormData> = {
      ...baseDraft,
      ...data,
      BoxID: data.BoxID || baseDraft.BoxID,
      ItemUUID: itemUUID || baseDraft.ItemUUID
    };

    await handleSubmit(mergedData);
  }

  return (
    <ItemForm_Agentic
      draft={baseDraft}
      step={step}
      onSubmitDetails={handleSubmitDetails}
      onSubmitPhotos={handleSubmitPhotos}
      submitLabel="Speichern"
      isNew
    />
  );
}
