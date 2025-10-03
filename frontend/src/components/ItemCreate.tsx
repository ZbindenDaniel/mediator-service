import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';
import { buildAgenticRunUrl, resolveAgenticApiBase, triggerAgenticRun as triggerAgenticRunRequest } from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemForm_Agentic from './ItemForm_agentic';
import { ItemBasicInfoForm } from './ItemBasicInfoForm';
import { ItemMatchSelection } from './ItemMatchSelection';
import type { ItemFormData } from './forms/itemFormShared';
import type { SimilarItem } from './forms/useSimilarItems';

type AgenticEnv = typeof globalThis & {
  AGENTIC_API_BASE?: string;
  process?: { env?: Record<string, string | undefined> };
};

type CreationStep = 'basicInfo' | 'matchSelection';

export default function ItemCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boxId = params.get('box') || null;
  const [agenticStep, setAgenticStep] = useState(1);
  const [draft, setDraft] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [itemUUID, setItemUUID] = useState<string | undefined>();
  const [shouldUseAgenticForm, setShouldUseAgenticForm] = useState(false);
  const [creationStep, setCreationStep] = useState<CreationStep>('basicInfo');
  const [basicInfo, setBasicInfo] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [creating, setCreating] = useState(false);

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

  const handleNavigateToEdit = useCallback(
    async (createdItem: Item | undefined) => {
      if (!createdItem?.ItemUUID) {
        console.error('Created item missing ItemUUID; cannot open edit view', createdItem);
        return;
      }

      try {
        alert('Artikel erstellt. Details können jetzt bearbeitet werden.');
      } catch (alertErr) {
        console.warn('Failed to display creation alert', alertErr);
      }

      try {
        navigate(`/items/${encodeURIComponent(createdItem.ItemUUID)}/edit`, { replace: true });
      } catch (navErr) {
        console.error('Failed to navigate to created item edit view', navErr);
      }
    },
    [navigate]
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

  async function triggerAgenticRun(agenticPayload: AgenticRunTriggerPayload, context: string) {
    if (!shouldUseAgenticForm) {
      console.info(`Agentic trigger skipped (${context}): service not healthy.`);
      return;
    }

    try {
      await triggerAgenticRunRequest({
        runUrl: agenticRunUrl,
        payload: agenticPayload,
        context
      });
    } catch (err) {
      console.error('Failed to trigger agentic run', err);
      if (agenticPayload.itemId) {
        await reportAgenticTriggerFailure({
          itemId: agenticPayload.itemId,
          search: agenticPayload.artikelbeschreibung ?? '',
          context,
          error: err
        });
      }
    }
  }

  function buildCreationParams(data: Partial<ItemFormData>, options: { removeItemUUID?: boolean } = {}) {
    const { removeItemUUID = true } = options;
    const params = new URLSearchParams();
    const sanitized: Record<string, unknown> = { ...data };
    if (!sanitized.BoxID && boxId) {
      sanitized.BoxID = boxId;
    }
    if (removeItemUUID && 'ItemUUID' in sanitized) {
      delete sanitized.ItemUUID;
    }
    const actor = getUser();
    if (actor) {
      sanitized.actor = actor;
    }

    Object.entries(sanitized).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });

    return params;
  }

  async function submitNewItem(
    data: Partial<ItemFormData>,
    context: string,
    options: {
      keepItemUUID?: boolean;
      onCreated?: (item: Item | undefined) => Promise<void> | void;
      suppressDefaultNavigation?: boolean;
    } = {}
  ) {
    if (creating) {
      console.warn('Item creation already running. Ignoring duplicate submit.', { context });
      return;
    }

    const { keepItemUUID = false, onCreated, suppressDefaultNavigation = false } = options;
    const params = buildCreationParams(data, { removeItemUUID: !keepItemUUID });
    try {
      setCreating(true);
      console.log('Submitting item creation payload', { context, data });
      const response = await fetch('/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      if (!response.ok) {
        console.error('Failed to create item', response.status);
        throw new Error(`Failed to create item. Status: ${response.status}`);
      }

      const body = await response.json();
      const createdItem: Item | undefined = body?.item;
      const searchText = createdItem?.Artikelbeschreibung || data.Artikelbeschreibung || '';
      const agenticPayload: AgenticRunTriggerPayload = {
        itemId: createdItem?.ItemUUID,
        artikelbeschreibung: searchText
      };

      await triggerAgenticRun(agenticPayload, context);

      if (onCreated) {
        try {
          await onCreated(createdItem);
        } catch (callbackErr) {
          console.error('onCreated callback for item creation failed', callbackErr);
        }
      }

      if (!suppressDefaultNavigation) {
        alert('Behälter erstellt. Bitte platzieren!');
        if (createdItem?.BoxID) {
          navigate(`/boxes/${encodeURIComponent(createdItem.BoxID)}`);
        }
      }
      return createdItem;
    } catch (err) {
      console.error('Failed to create item', err);
      throw err;
    } finally {
      setCreating(false);
    }
  }

  const handleBasicInfoNext = (data: Partial<ItemFormData>) => {
    try {
      const trimmedDescription = data.Artikelbeschreibung?.trim() || data.Artikelbeschreibung;
      const normalized: Partial<ItemFormData> = {
        ...data,
        BoxID: data.BoxID || boxId || undefined,
        Artikelbeschreibung: trimmedDescription,
        Auf_Lager: data.Auf_Lager ?? 1
      };
      console.log('Advancing to match selection with basic info', normalized);
      setBasicInfo(normalized);
      setCreationStep('matchSelection');
    } catch (err) {
      console.error('Failed to prepare basic info for next step', err);
    }
  };

  const handleMatchSelection = async (item: SimilarItem) => {
    if (creating) {
      console.warn('Skipping match selection submit; creation already running.');
      return;
    }
    try {
      const clone: Partial<ItemFormData> = {
        ...item,
        ...basicInfo,
        BoxID: basicInfo.BoxID || item.BoxID || boxId || undefined,
        Artikelbeschreibung: basicInfo.Artikelbeschreibung || item.Artikelbeschreibung,
        Artikel_Nummer: basicInfo.Artikel_Nummer || item.Artikel_Nummer,
        Auf_Lager: basicInfo.Auf_Lager ?? item.Auf_Lager,
        picture1: basicInfo.picture1 || item.picture1,
        picture2: basicInfo.picture2 || item.picture2,
        picture3: basicInfo.picture3 || item.picture3
      };
      if ('ItemUUID' in clone) {
        delete clone.ItemUUID;
      }
      console.log('Creating item from selected duplicate', { itemUUID: item.ItemUUID });
      await submitNewItem(clone, 'match-selection', {
        suppressDefaultNavigation: true,
        onCreated: handleNavigateToEdit
      });
    } catch (err) {
      console.error('Failed to create item from duplicate selection', err);
    }
  };

  const handleSkipMatches = async () => {
    if (creating) {
      console.warn('Skipping duplicate bypass; creation already running.');
      return;
    }
    console.log('No duplicate selected, creating item directly');
    try {
      const payload: Partial<ItemFormData> = {
        ...basicInfo,
        BoxID: basicInfo.BoxID || boxId || undefined,
        Artikelbeschreibung: basicInfo.Artikelbeschreibung,
        Auf_Lager: basicInfo.Auf_Lager,
        picture1: basicInfo.picture1,
        picture2: basicInfo.picture2,
        picture3: basicInfo.picture3
      };
      await submitNewItem(payload, 'skip-duplicates', {
        suppressDefaultNavigation: true,
        onCreated: handleNavigateToEdit
      });
    } catch (err) {
      console.error('Failed to create item after skipping duplicates', err);
    }
  };

  const handleAgenticDetails = async (data: Partial<ItemFormData>) => {
    console.log('Submitting agentic step 1 item details', data);
    const detailPayload: Partial<ItemFormData> = {
      Artikelbeschreibung: data.Artikelbeschreibung,
      Artikel_Nummer: data.Artikel_Nummer,
      Auf_Lager: data.Auf_Lager,
      BoxID: data.BoxID || boxId || undefined,
      agenticStatus: 'queued',
      agenticSearch: data.Artikelbeschreibung
    };

    const params = buildCreationParams(detailPayload);

    try {
      const response = await fetch('/api/import/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!response.ok) {
        console.error('Failed to create item during agentic step 1', response.status);
        throw new Error(`Failed to create item. Status: ${response.status}`);
      }

      const body = await response.json();
      const createdItem: Item | undefined = body?.item;

      setDraft((prev) => ({
        ...prev,
        ...detailPayload,
        BoxID: createdItem?.BoxID || detailPayload.BoxID,
        ItemUUID: createdItem?.ItemUUID || prev.ItemUUID,
        agenticStatus: 'queued',
        agenticSearch: detailPayload.agenticSearch
      }));
      setItemUUID(createdItem?.ItemUUID || itemUUID);
      setAgenticStep(2);

      const searchText = createdItem?.Artikelbeschreibung || detailPayload.Artikelbeschreibung || '';
      const agenticPayload: AgenticRunTriggerPayload = {
        itemId: createdItem?.ItemUUID,
        artikelbeschreibung: searchText
      };

      await triggerAgenticRun(agenticPayload, 'agentic-step-one');
    } catch (err) {
      console.error('Failed to submit agentic step 1 item details', err);
      throw err;
    }
  };

  const handleAgenticPhotos = async (data: Partial<ItemFormData>) => {
    console.log('Submitting agentic step 2 item photos', data);
    const mergedData: Partial<ItemFormData> = {
      ...baseDraft,
      ...data,
      BoxID: data.BoxID || baseDraft.BoxID,
      ItemUUID: itemUUID || baseDraft.ItemUUID,
      agenticStatus: 'running',
      agenticSearch: baseDraft.agenticSearch || baseDraft.Artikelbeschreibung
    };

    await submitNewItem(mergedData, 'agentic-step-two', { keepItemUUID: true });
  };

  console.log(`Rendering item create form (step ${shouldUseAgenticForm ? agenticStep : creationStep})`, shouldUseAgenticForm);
  if (shouldUseAgenticForm) {
    return (
      <ItemForm_Agentic
        draft={baseDraft}
        step={agenticStep}
        onSubmitDetails={handleAgenticDetails}
        onSubmitPhotos={handleAgenticPhotos}
        submitLabel="Speichern"
        isNew
      />
    );
  }

  if (creationStep === 'basicInfo') {
    return <ItemBasicInfoForm initialValues={basicInfo} onSubmit={handleBasicInfoNext} />;
  }

  if (creationStep === 'matchSelection') {
    return (
      <ItemMatchSelection
        searchTerm={basicInfo.Artikelbeschreibung || ''}
        onSelect={handleMatchSelection}
        onSkip={handleSkipMatches}
      />
    );
  }

  console.warn('Item creation reached unexpected step state', creationStep);
  return null;
}
