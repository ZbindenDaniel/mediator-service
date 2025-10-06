import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Item } from '../../../models';
import { ensureUser } from '../lib/user';
import {
  buildAgenticRunUrl,
  resolveAgenticApiBase,
  triggerAgenticRun as triggerAgenticRunRequest
} from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemForm from './ItemForm';
import { ItemBasicInfoForm } from './ItemBasicInfoForm';
import { ItemMatchSelection } from './ItemMatchSelection';
import { useDialog } from './dialog';
import type { ItemFormData, LockedFieldConfig } from './forms/itemFormShared';
import { extractReferenceFields } from './forms/itemFormShared';
import type { SimilarItem } from './forms/useSimilarItems';

type AgenticEnv = typeof globalThis & {
  AGENTIC_API_BASE?: string;
  process?: { env?: Record<string, string | undefined> };
};

type CreationStep = 'basicInfo' | 'matchSelection' | 'manualEdit';

export interface AgenticTriggerFailureReportArgs {
  itemId: string;
  search: string;
  context: string;
  status?: number;
  responseBody?: string | null;
  error?: unknown;
}

export type AgenticTriggerFailureReporter = (args: AgenticTriggerFailureReportArgs) => Promise<void>;

export interface AgenticTriggerHandlerOptions {
  agenticPayload: AgenticRunTriggerPayload;
  context: string;
  agenticRunUrl: string | null;
  triggerAgenticRunRequest: typeof triggerAgenticRunRequest;
  reportFailure: AgenticTriggerFailureReporter;
  alertFn: (message: string) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  onSkipped?: (itemId: string) => void;
}

export async function handleAgenticRunTrigger({
  agenticPayload,
  context,
  agenticRunUrl,
  triggerAgenticRunRequest,
  reportFailure,
  alertFn,
  logger = console,
  onSkipped
}: AgenticTriggerHandlerOptions): Promise<void> {
  const trimmedItemId =
    typeof agenticPayload.itemId === 'string' && agenticPayload.itemId.trim()
      ? agenticPayload.itemId.trim()
      : '';
  const searchTerm = agenticPayload.artikelbeschreibung ?? '';

  try {
    const result = await triggerAgenticRunRequest({
      runUrl: agenticRunUrl,
      payload: agenticPayload,
      context
    });

    const status = result.outcome === 'triggered' || result.outcome === 'failed' ? result.status : undefined;
    logger.info?.('Agentic trigger result', { context, outcome: result.outcome, status });

    if (result.outcome === 'triggered') {
      return;
    }

    if (result.outcome === 'skipped') {
      if (trimmedItemId) {
        try {
          await reportFailure({
            itemId: trimmedItemId,
            search: searchTerm,
            context,
            responseBody: result.message,
            error: result.reason
          });
        } catch (failureErr) {
          logger.error?.('Failed to report skipped agentic trigger', failureErr);
        }
        onSkipped?.(trimmedItemId);
      } else {
        logger.warn?.('Agentic trigger skipped without ItemUUID', { context, reason: result.reason });
      }

      if (result.message) {
        try {
          await alertFn(result.message);
        } catch (alertErr) {
          logger.warn?.('Failed to display skipped agentic trigger message', alertErr);
        }
      }
      return;
    }

    if (trimmedItemId) {
      try {
        await reportFailure({
          itemId: trimmedItemId,
          search: searchTerm,
          context,
          status: result.status,
          responseBody: result.message,
          error: result.error
        });
      } catch (failureErr) {
        logger.error?.('Failed to report agentic trigger failure outcome', failureErr);
      }
    } else {
      logger.warn?.('Agentic trigger failed without ItemUUID', { context, reason: result.reason });
    }

    if (result.message) {
      try {
        await alertFn(result.message);
      } catch (alertErr) {
        logger.warn?.('Failed to display agentic trigger failure message', alertErr);
      }
    }
  } catch (err) {
    logger.error?.('Failed to trigger agentic run', err);
    if (trimmedItemId) {
      try {
        await reportFailure({
          itemId: trimmedItemId,
          search: searchTerm,
          context,
          error: err
        });
      } catch (failureErr) {
        logger.error?.('Failed to report agentic trigger exception', failureErr);
      }
    }
  }
}

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
  const [manualDraft, setManualDraft] = useState<Partial<ItemFormData>>(() => ({ BoxID: boxId || undefined }));
  const [creating, setCreating] = useState(false);
  const dialog = useDialog();

  const showAgenticAlert = useCallback(
    async (message: string) => {
      if (!message) {
        return;
      }
      try {
        await dialog.alert({
          title: 'Hinweis',
          message
        });
      } catch (alertErr) {
        console.warn('Failed to display agentic trigger alert', alertErr);
      }
    },
    [dialog]
  );

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
  }: AgenticTriggerFailureReportArgs) {
    if (!itemId) {
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      console.info('Agentic trigger failure will be reported without actor.');
    }
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
      await handleAgenticRunTrigger({
        agenticPayload,
        context,
        agenticRunUrl,
        triggerAgenticRunRequest,
        reportFailure: reportAgenticTriggerFailure,
        alertFn: showAgenticAlert,
        logger: console,
        onSkipped: (itemId) => {
          setDraft((prev) => (prev.ItemUUID === itemId ? { ...prev, agenticStatus: undefined } : prev));
        }
      });
    } catch (err) {
      console.error('Unhandled error while processing agentic trigger', err);
    }
  }

  function buildCreationParams(
    data: Partial<ItemFormData>,
    options: { removeItemUUID?: boolean } = {},
    actor?: string
  ) {
    const { removeItemUUID = true } = options;
    const params = new URLSearchParams();
    const sanitized: Record<string, unknown> = { ...data };
    if (!sanitized.BoxID && boxId) {
      sanitized.BoxID = boxId;
    }
    if (removeItemUUID && 'ItemUUID' in sanitized) {
      delete sanitized.ItemUUID;
    }
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
    options: { keepItemUUID?: boolean } = {}
  ) {
    if (creating) {
      console.warn('Item creation already running. Ignoring duplicate submit.', { context });
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      console.info('Item creation aborted: missing username.');
      try {
        await dialog.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for item creation', error);
      }
      return;
    }
    const params = buildCreationParams(data, { removeItemUUID: !options.keepItemUUID }, actor);
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

      try {
        await dialog.alert({
          title: 'Artikel erstellt',
          message: 'Behälter erstellt. Bitte platzieren!'
        });
      } catch (error) {
        console.error('Failed to display item creation success dialog', error);
      }
      // TODO: Replace imperative navigation with centralized success handling once notification system lands.
      if (createdItem?.BoxID) {
        console.log('Navigating to created item box', { boxId: createdItem.BoxID });
        navigate(`/boxes/${encodeURIComponent(createdItem.BoxID)}`);
      } else if (createdItem?.ItemUUID) {
        console.log('Navigating to created item detail', { itemId: createdItem.ItemUUID });
        navigate(`/items/${encodeURIComponent(createdItem.ItemUUID)}`);
      }
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
      const trimmedNumber = data.Artikel_Nummer?.trim() || data.Artikel_Nummer;
      const normalized: Partial<ItemFormData> = {
        ...data,
        BoxID: data.BoxID || boxId || undefined,
        Artikelbeschreibung: trimmedDescription,
        Artikel_Nummer: trimmedNumber
      };
      console.log('Advancing to match selection with basic info', normalized);
      setBasicInfo(normalized);
      setManualDraft(normalized);
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
      const referenceFields = extractReferenceFields(item);
      const clone: Partial<ItemFormData> = {
        ...referenceFields,
        ...basicInfo,
        BoxID: basicInfo.BoxID || boxId || undefined,
        Artikelbeschreibung: basicInfo.Artikelbeschreibung,
        Artikel_Nummer: basicInfo.Artikel_Nummer || referenceFields.Artikel_Nummer,
        Kurzbeschreibung: basicInfo.Kurzbeschreibung || referenceFields.Kurzbeschreibung,
        Auf_Lager: basicInfo.Auf_Lager,
        picture1: basicInfo.picture1,
        picture2: basicInfo.picture2,
        picture3: basicInfo.picture3
      };
      if ('ItemUUID' in clone) {
        delete clone.ItemUUID;
      }
      console.log('Creating item from selected duplicate', { itemUUID: item.ItemUUID });
      await submitNewItem(clone, 'match-selection');
    } catch (err) {
      console.error('Failed to create item from duplicate selection', err);
    }
  };

  const handleSkipMatches = () => {
    console.log('No duplicate selected, switching to manual edit');
    setManualDraft((prev) => ({ ...prev, ...basicInfo }));
    setCreationStep('manualEdit');
  };

  const handleManualSubmit = async (data: Partial<ItemFormData>) => {
    console.log('Submitting manual edit item details', data);
    if (creating) {
      console.warn('Skipping manual submit; creation already running.');
      return;
    }
    const merged: Partial<ItemFormData> = {
      ...basicInfo,
      ...data,
      BoxID: data.BoxID || basicInfo.BoxID || boxId || undefined,
      Artikelbeschreibung: basicInfo.Artikelbeschreibung,
      Artikel_Nummer: basicInfo.Artikel_Nummer,
      Auf_Lager: basicInfo.Auf_Lager,
      picture1: basicInfo.picture1,
      picture2: basicInfo.picture2,
      picture3: basicInfo.picture3
    };
    await submitNewItem(merged, 'manual-edit');
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

    const actor = await ensureUser();
    if (!actor) {
      console.info('Agentic step 1 submission aborted: missing username.');
      try {
        await dialog.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for agentic details', error);
      }
      return;
    }

    const params = buildCreationParams(detailPayload, {}, actor);

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

  const manualLockedFields = useMemo<LockedFieldConfig>(
    () => ({
      Artikelbeschreibung: 'readonly',
      Artikel_Nummer: 'readonly',
      Auf_Lager: 'readonly'
    }),
    []
  );

  console.log(`Rendering item create form (step ${shouldUseAgenticForm ? agenticStep : creationStep})`, shouldUseAgenticForm);
  // TODO: if(isLoading) display loading state LoadingPage
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

  return (
    <ItemForm
      item={manualDraft}
      onSubmit={handleManualSubmit}
      submitLabel="Speichern"
      isNew
      headerContent={
        <>
          <h2>Details ergänzen</h2>
          <p>Die Pflichtfelder wurden übernommen. Bitte ergänzen Sie bei Bedarf weitere Angaben.</p>
        </>
      }
      lockedFields={manualLockedFields}
      hidePhotoInputs
    />
  );
}
