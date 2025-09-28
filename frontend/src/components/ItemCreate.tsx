import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';
import { buildAgenticRunUrl, resolveAgenticApiBase, triggerAgenticRun as triggerAgenticRunRequest } from '../lib/agentic';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemForm from './ItemForm';
import type { ItemFormData } from './forms/itemFormShared';

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || null;
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [itemUUID, setItemUUID] = useState<string | undefined>();
  const [shouldUseAgenticForm, setShouldUseAgenticForm] = useState(false);

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);

  const agenticRunUrl = useMemo(() => buildAgenticRunUrl(agenticApiBase), [agenticApiBase]);

  useEffect(() => {
    let cancelled = false;

    async function checkAgenticHealth() {
      if (!agenticApiBase) {
        console.info('Agentic API base URL not configured. Falling back to legacy item form.');
        setShouldUseAgenticForm(false);
        return;
      }

      try {
        const healthUrl = new URL('/health', agenticApiBase).toString();
        const response = await fetch(healthUrl, { method: 'GET' });
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          console.warn('Agentic health endpoint returned non-OK status', response.status);
          setShouldUseAgenticForm(false);
          return;
        }

        const body = await response
          .json()
          .catch((jsonError) => {
            console.error('Failed to parse agentic health response', jsonError);
            return null;
          });

        if (cancelled) {
          return;
        }

        if (body?.ok === true) {
          setShouldUseAgenticForm(true);
          console.log('Agentic health check succeeded.');
        } else {
          console.warn('Agentic health endpoint reported unhealthy payload', body);
          setShouldUseAgenticForm(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Agentic health check failed', err);
          setShouldUseAgenticForm(false);
        }
      }
    }

    void checkAgenticHealth();

    return () => {
      cancelled = true;
    };
  }, [agenticApiBase]);

  const baseDraft = useMemo(
    () => ({
      ...draft,
      BoxID: draft.BoxID || boxId || undefined,
      ItemUUID: itemUUID || draft.ItemUUID
    }),
    [boxId, draft, itemUUID]
  );

  async function reportAgenticTriggerFailure({
    itemId,
    search,
    context,
    status,
    responseBody,
    error
  }: {
    itemId: string;
    search: string;
    context: string;
    status?: number;
    responseBody?: string | null;
    error?: unknown;
  }) {
    if (!itemId) {
      return;
    }

    const actor = getUser();
    let errorMessage = '';
    if (typeof error === 'string' && error.trim()) {
      errorMessage = error.trim();
    } else if (error instanceof Error && error.message.trim()) {
      errorMessage = error.message.trim();
    } else if (error && typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error);
      } catch (stringifyErr) {
        console.warn('Failed to stringify agentic trigger error details', stringifyErr);
      }
    }

    if (!errorMessage && typeof status === 'number') {
      errorMessage = `Agentic trigger failed with status ${status}`;
    }

    if (!errorMessage) {
      errorMessage = 'Agentic trigger failed';
    }

    const trimmedContext = context.trim();
    const failurePayload: Record<string, unknown> = {
      search,
      searchTerm: search,
      context: trimmedContext || undefined,
      error: errorMessage,
      status,
      responseBody: responseBody && responseBody.trim() ? responseBody : undefined,
    };

    if (actor) {
      failurePayload.actor = actor;
    }

    try {
      const failureUrl = `/api/items/${encodeURIComponent(itemId)}/agentic/trigger-failure`;
      const res = await fetch(failureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(failurePayload)
      });

      if (res.ok) {
        const body = await res
          .json()
          .catch((jsonErr) => {
            console.error('Failed to parse agentic failure response', jsonErr);
            return null;
          });

        const updatedRun = body?.agentic ?? null;
        if (updatedRun) {
          setDraft((prev) =>
            prev.ItemUUID === itemId
              ? {
                  ...prev,
                  agenticStatus: undefined,
                  agenticSearch: updatedRun.SearchQuery || prev.agenticSearch
                }
              : prev
          );
        } else {
          setDraft((prev) => (prev.ItemUUID === itemId ? { ...prev, agenticStatus: undefined } : prev));
        }
      } else {
        console.error('Agentic failure reporting endpoint returned non-OK status', res.status);
        setDraft((prev) => (prev.ItemUUID === itemId ? { ...prev, agenticStatus: undefined } : prev));
      }
    } catch (failureErr) {
      console.error('Failed to report agentic trigger failure', failureErr);
      setDraft((prev) => (prev.ItemUUID === itemId ? { ...prev, agenticStatus: undefined } : prev));
    }

    try {
      const refreshUrl = `/api/items/${encodeURIComponent(itemId)}/agentic`;
      const refreshRes = await fetch(refreshUrl, { method: 'GET', cache: 'reload' });
      if (refreshRes.ok) {
        const refreshed = await refreshRes
          .json()
          .catch((refreshErr) => {
            console.error('Failed to parse refreshed agentic status', refreshErr);
            return null;
          });
        const refreshedRun = refreshed?.agentic ?? null;
        if (refreshedRun) {
          setDraft((prev) =>
            prev.ItemUUID === itemId
              ? {
                  ...prev,
                  agenticStatus: undefined,
                  agenticSearch: refreshedRun.SearchQuery || prev.agenticSearch
                }
              : prev
          );
        }
      } else {
        console.warn('Failed to refresh agentic status cache after failure', refreshRes.status);
      }
    } catch (refreshErr) {
      console.warn('Agentic status refresh after failure threw an error', refreshErr);
    }
  }

  async function triggerAgenticRun(agenticPayload: { id: string | undefined; search: string }, context: string) {
    if (!shouldUseAgenticForm) {
      console.info(`Agentic trigger skipped (${context}): service not healthy.`);
      return;
    }

    await triggerAgenticRunRequest({
      runUrl: agenticRunUrl,
      payload: agenticPayload,
      context
    });
  }

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

      void triggerAgenticRun(agenticPayload, 'item creation');

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
      BoxID: data.BoxID || boxId || undefined,
      agenticStatus: 'queued' as const,
      agenticSearch: data.Artikelbeschreibung
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
        ItemUUID: createdItem?.ItemUUID || prev.ItemUUID,
        agenticStatus: 'queued',
        agenticSearch: detailPayload.agenticSearch
      }));
      setItemUUID(createdItem?.ItemUUID || itemUUID);

      const searchText = createdItem?.Artikelbeschreibung || detailPayload.Artikelbeschreibung || '';
      const agenticPayload = {
        id: createdItem?.ItemUUID,
        search: searchText
      };

      setStep(2);

      void triggerAgenticRun(agenticPayload, 'step one submission');
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
      ItemUUID: itemUUID || baseDraft.ItemUUID,
      agenticStatus: 'running',
      agenticSearch: baseDraft.agenticSearch || baseDraft.Artikelbeschreibung
    };

    await handleSubmit(mergedData);
  }

  if (shouldUseAgenticForm) {
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

  return (
    <ItemForm
      item={baseDraft}
      onSubmit={handleSubmit}
      submitLabel="Speichern"
      isNew
    />
  );
}
