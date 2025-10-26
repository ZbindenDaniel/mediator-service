import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Item, ItemRef } from '../../../models';
import { ensureUser } from '../lib/user';
import { resolveAgenticApiBase, triggerAgenticRun as triggerAgenticRunRequest } from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemForm from './ItemForm';
import { ItemBasicInfoForm } from './ItemBasicInfoForm';
import { ItemMatchSelection } from './ItemMatchSelection';
import { useDialog } from './dialog';
import LoadingPage from './LoadingPage';
import type { ItemFormData, LockedFieldConfig } from './forms/itemFormShared';
import { ITEM_FORM_DEFAULT_EINHEIT, extractReferenceFields } from './forms/itemFormShared';
import type { SimilarItem } from './forms/useSimilarItems';

type AgenticEnv = typeof globalThis & {
  AGENTIC_API_BASE?: string;
  process?: { env?: Record<string, string | undefined> };
};

type CreationStep = 'basicInfo' | 'matchSelection' | 'agenticPhotos' | 'manualEdit';

export interface AgenticHealthProxyOptions {
  fetchImpl?: typeof fetch;
}

export interface AgenticHealthProxyResult {
  ok: boolean;
  status: number;
  body: unknown;
  parseError?: unknown;
}

export async function fetchAgenticHealthProxy(
  options: AgenticHealthProxyOptions = {}
): Promise<AgenticHealthProxyResult> {
  const { fetchImpl = fetch } = options;

  const response = await fetchImpl('/api/agentic/health', { method: 'GET' });
  let body: unknown = null;
  let parseError: unknown;
  try {
    body = await response.json();
  } catch (err) {
    parseError = err;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    parseError
  };
}

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

export const MANUAL_CREATION_LOCKS: LockedFieldConfig = {
  Artikelbeschreibung: 'readonly',
  Artikel_Nummer: 'readonly'
};

interface ManualSubmissionOptions {
  basicInfo: Partial<ItemFormData>;
  manualData: Partial<ItemFormData>;
}

export function buildManualSubmissionPayload({
  basicInfo,
  manualData
}: ManualSubmissionOptions): Partial<ItemFormData> {
  const preferredDescription =
    typeof manualData.Artikelbeschreibung === 'string' && manualData.Artikelbeschreibung.trim() !== ''
      ? manualData.Artikelbeschreibung
      : basicInfo.Artikelbeschreibung;
  const preferredNumber =
    typeof manualData.Artikel_Nummer === 'string' && manualData.Artikel_Nummer.trim() !== ''
      ? manualData.Artikel_Nummer
      : basicInfo.Artikel_Nummer;

  const resolvedBoxId =
    typeof manualData.BoxID === 'string' && manualData.BoxID.trim() !== ''
      ? manualData.BoxID.trim()
      : typeof basicInfo.BoxID === 'string' && basicInfo.BoxID.trim() !== ''
      ? basicInfo.BoxID.trim()
      : undefined;

  if (!resolvedBoxId) {
    console.info('Manual submission payload missing BoxID; item will remain unplaced after creation.');
  }

  const merged: Partial<ItemFormData> = {
    ...basicInfo,
    ...manualData,
    BoxID: resolvedBoxId,
    Artikelbeschreibung:
      typeof preferredDescription === 'string' ? preferredDescription.trim() : preferredDescription,
    Artikel_Nummer: typeof preferredNumber === 'string' ? preferredNumber.trim() : preferredNumber,
    Auf_Lager: manualData.Auf_Lager ?? basicInfo.Auf_Lager
  };

  return merged;
}

export interface ManualFallbackMergeOptions {
  previousManualDraft: Partial<ItemFormData>;
  baseDraft: Partial<ItemFormData>;
  agenticData?: Partial<ItemFormData>;
}

export function mergeManualDraftForFallback({
  previousManualDraft,
  baseDraft,
  agenticData
}: ManualFallbackMergeOptions): Partial<ItemFormData> {
  const sanitizedAgentic: Partial<ItemFormData> = {};
  if (agenticData) {
    for (const [key, value] of Object.entries(agenticData)) {
      if (value !== undefined && value !== null) {
        (sanitizedAgentic as Record<string, unknown>)[key] = value;
      }
    }
  }

  const merged: Partial<ItemFormData> = {
    ...previousManualDraft,
    ...baseDraft,
    ...sanitizedAgentic
  };

  delete (merged as Record<string, unknown>).ItemUUID;
  delete (merged as Record<string, unknown>).agenticStatus;
  delete (merged as Record<string, unknown>).agenticSearch;

  if (typeof merged.BoxID === 'string') {
    const trimmedBoxId = merged.BoxID.trim();
    if (trimmedBoxId) {
      merged.BoxID = trimmedBoxId;
    } else {
      delete (merged as Record<string, unknown>).BoxID;
    }
  }

  return merged;
}

export function buildCreationParams(
  data: Partial<ItemFormData>,
  options: { removeItemUUID?: boolean } = {},
  actor?: string
) {
  const { removeItemUUID = true } = options;
  const params = new URLSearchParams();
  const sanitized: Record<string, unknown> = { ...data };
  if (typeof sanitized.Artikelbeschreibung === 'string') {
    sanitized.Artikelbeschreibung = sanitized.Artikelbeschreibung.trim();
  }
  if (typeof sanitized.Artikel_Nummer === 'string') {
    sanitized.Artikel_Nummer = sanitized.Artikel_Nummer.trim();
  }
  if (removeItemUUID && 'ItemUUID' in sanitized) {
    delete sanitized.ItemUUID;
  }
  if (actor) {
    sanitized.actor = actor;
  }

  if ('BoxID' in sanitized) {
    const rawBoxId = sanitized.BoxID;
    if (typeof rawBoxId === 'string') {
      const trimmedBoxId = rawBoxId.trim();
      if (trimmedBoxId) {
        sanitized.BoxID = trimmedBoxId;
      } else {
        console.info('Removing blank BoxID from item creation payload before submission.');
        delete sanitized.BoxID;
      }
    } else if (rawBoxId == null) {
      delete sanitized.BoxID;
    } else {
      sanitized.BoxID = String(rawBoxId);
    }
  }

  const einheit = sanitized.Einheit;
  if (typeof einheit !== 'string' || einheit.trim() === '') {
    sanitized.Einheit = ITEM_FORM_DEFAULT_EINHEIT;
  }

  Object.entries(sanitized).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return params;
}

export default function ItemCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<Partial<ItemFormData>>(() => ({}));
  const [shouldUseAgenticForm, setShouldUseAgenticForm] = useState(false);
  const [creationStep, setCreationStep] = useState<CreationStep>('basicInfo');
  const [basicInfo, setBasicInfo] = useState<Partial<ItemFormData>>(() => ({}));
  const [manualDraft, setManualDraft] = useState<Partial<ItemFormData>>(() => ({}));
  const [creating, setCreating] = useState(false);
  const dialog = useDialog();
  const queryPrefilledBoxRef = useRef<string | null>(null);

  const preselectedBoxId = useMemo(() => {
    if (!location.search) {
      return undefined;
    }

    try {
      const params = new URLSearchParams(location.search);
      if (!params.has('box')) {
        return undefined;
      }

      const rawBoxId = params.get('box');
      if (rawBoxId == null) {
        return undefined;
      }

      const trimmedBoxId = rawBoxId.trim();
      if (!trimmedBoxId) {
        console.info('Ignoring empty box query parameter for item creation workflow.', { rawBoxId });
        return undefined;
      }

      console.log('Detected box query parameter for item creation workflow.', {
        rawBoxId,
        normalizedBoxId: trimmedBoxId
      });

      return trimmedBoxId;
    } catch (error) {
      console.error('Failed to parse query parameters for item creation workflow.', {
        search: location.search,
        error
      });
      return undefined;
    }
  }, [location.search]);

  useEffect(() => {
    if (!preselectedBoxId) {
      if (queryPrefilledBoxRef.current !== null) {
        queryPrefilledBoxRef.current = null;
        console.log('Cleared box query parameter prefill tracking after parameter removal.');
      }
      return;
    }

    if (queryPrefilledBoxRef.current === preselectedBoxId) {
      return;
    }

    try {
      const applyBoxId = (previous: Partial<ItemFormData>): Partial<ItemFormData> => {
        const previousBoxId =
          typeof previous.BoxID === 'string' && previous.BoxID.trim() ? previous.BoxID.trim() : undefined;

        if (previousBoxId === preselectedBoxId) {
          return previous;
        }

        return {
          ...previous,
          BoxID: preselectedBoxId
        };
      };

      setDraft(applyBoxId);
      setBasicInfo(applyBoxId);
      setManualDraft(applyBoxId);
      queryPrefilledBoxRef.current = preselectedBoxId;
      console.log('Applied box query parameter to item creation draft state.', { boxId: preselectedBoxId });
    } catch (error) {
      console.error('Failed to apply box query parameter to item creation draft state.', error);
    }
  }, [preselectedBoxId]);

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

  const agenticRunUrl = '/api/agentic/run';

  useEffect(() => {
    let cancelled = false;

    async function checkAgenticHealth() {
      if (!agenticApiBase) {
        console.info('Agentic API base URL not configured. Falling back to legacy item form.');
        setShouldUseAgenticForm(false);
        return;
      }

      try {
        const result = await fetchAgenticHealthProxy();
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          console.warn('Agentic health endpoint returned non-OK status', result.status);
          setShouldUseAgenticForm(false);
          return;
        }

        if (result.parseError) {
          console.error('Failed to parse agentic health response', result.parseError);
        }

        if (cancelled) {
          return;
        }

        const body = result.body as { ok?: boolean } | null;

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
      ...draft
    }),
    [draft]
  );

  const moveToAgenticPhotos = useCallback(
    (data: Partial<ItemFormData>, source: 'match-selection' | 'skip-matches') => {
      try {
        const normalized: Partial<ItemFormData> = {
          ...data
        };

        if (typeof normalized.Artikelbeschreibung === 'string') {
          normalized.Artikelbeschreibung = normalized.Artikelbeschreibung.trim();
        }
        if (typeof normalized.Artikel_Nummer === 'string') {
          normalized.Artikel_Nummer = normalized.Artikel_Nummer.trim();
        }
        if (typeof normalized.BoxID === 'string') {
          const trimmedBoxId = normalized.BoxID.trim();
          if (trimmedBoxId) {
            normalized.BoxID = trimmedBoxId;
          } else {
            delete normalized.BoxID;
          }
        }

        const resolvedSearch =
          typeof normalized.agenticSearch === 'string' && normalized.agenticSearch.trim()
            ? normalized.agenticSearch.trim()
            : typeof normalized.Artikelbeschreibung === 'string'
            ? normalized.Artikelbeschreibung
            : undefined;

        console.log('Transitioning to agentic photo upload step', { source, normalizedDraft: normalized });

        setDraft((prev) => {
          const nextDraft: Partial<ItemFormData> = {
            ...prev,
            ...normalized,
            agenticSearch: resolvedSearch ?? prev.agenticSearch,
            agenticStatus: undefined
          };

          if ('ItemUUID' in nextDraft) {
            delete (nextDraft as Record<string, unknown>).ItemUUID;
          }

          return nextDraft;
        });
        setCreationStep('agenticPhotos');
      } catch (err) {
        console.error('Failed to prepare data for agentic photo upload step', err);
        throw err;
      }
    },
    [setCreationStep, setDraft]
  );

  const handleAgenticFallback = useCallback(
    (agenticData: Partial<ItemFormData>) => {
      const hasAgenticDescription = Boolean(agenticData && agenticData.Artikelbeschreibung);
      const hasAgenticMaterialNumber = Boolean(agenticData && agenticData.Artikel_Nummer);
      console.log('Agentic flow fallback initiated by user', {
        fromStep: creationStep,
        hasAgenticDescription,
        hasAgenticMaterialNumber
      });

      let mergedManualDraft: Partial<ItemFormData> | undefined;

      try {
        setManualDraft((previousManualDraft) => {
          const nextManualDraft = mergeManualDraftForFallback({
            previousManualDraft,
            baseDraft,
            agenticData
          });
          mergedManualDraft = nextManualDraft;
          return nextManualDraft;
        });
        setDraft((prev) => {
          const nextDraft: Partial<ItemFormData> = { ...prev };
          delete (nextDraft as Record<string, unknown>).agenticStatus;
          delete (nextDraft as Record<string, unknown>).agenticSearch;
          return nextDraft;
        });
      } catch (err) {
        console.error('Failed to merge agentic draft into manual fallback state', err);
      } finally {
        console.log('Switching to manual edit after agentic fallback', {
          fromStep: creationStep,
          hasMergedDescription: Boolean(mergedManualDraft?.Artikelbeschreibung),
          hasMergedMaterialNumber: Boolean(mergedManualDraft?.Artikel_Nummer)
        });
        setCreationStep('manualEdit');
      }
    },
    [baseDraft, creationStep, setCreationStep, setDraft]
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

  function triggerAgenticRun(agenticPayload: AgenticRunTriggerPayload, context: string) {
    if (!shouldUseAgenticForm) {
      return;
    }

    try {
      console.log('Scheduling asynchronous agentic trigger', { context });
      const triggerPromise = handleAgenticRunTrigger({
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

      triggerPromise.catch((err) => {
        console.error('Unhandled error while processing agentic trigger', err);
      });
    } catch (err) {
      console.error('Failed to start agentic trigger workflow', err);
    }
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

    const normalizedBoxId =
      typeof data.BoxID === 'string' && data.BoxID.trim() !== '' ? data.BoxID.trim() : undefined;
    if (!normalizedBoxId) {
      console.info('Submitting new item without box placement; item will remain unplaced until moved.', {
        context,
        hasBoxIdField: Object.prototype.hasOwnProperty.call(data, 'BoxID')
      });
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

      triggerAgenticRun(agenticPayload, context);

      const successMessage =
        normalizedBoxId && createdItem?.BoxID
          ? `Artikel wurde erfasst und dem Behälter ${createdItem.BoxID} zugeordnet.`
          : 'Artikel wurde erfasst und ist noch keinem Behälter zugeordnet. Bitte platzieren!';

      let shouldNavigateToCreatedItem = Boolean(createdItem?.ItemUUID);
      try {
        const goToCreatedItem = await dialog.confirm({
          title: 'Artikel erstellt',
          message: successMessage,
          confirmLabel: 'Zum Artikel',
          cancelLabel: 'Weiter erfassen'
        });
        if (goToCreatedItem) {
          shouldNavigateToCreatedItem = Boolean(createdItem?.ItemUUID);
        } else {
          shouldNavigateToCreatedItem = false;
          console.log('Resetting item creation form for additional entry after success dialog choice.');
          setCreationStep('basicInfo');
          setDraft(() => ({}));
          setBasicInfo(() => ({}));
          setManualDraft(() => ({}));
          queryPrefilledBoxRef.current = null;
          if (preselectedBoxId) {
            console.log('Cleared applied box prefill to allow reapplication.', { boxId: preselectedBoxId });
          }
        }
      } catch (error) {
        console.error('Failed to display item creation success dialog', error);
      }
      // TODO: Replace imperative navigation with centralized success handling once notification system lands.
      if (shouldNavigateToCreatedItem && createdItem?.ItemUUID) {
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
      const basicReferenceOverrides = extractReferenceFields(basicInfo);
      const preferredReferenceFields: Partial<ItemFormData> = { ...referenceFields };

      (Object.keys(basicReferenceOverrides) as (keyof ItemRef)[]).forEach((key) => {
        const overrideValue = basicReferenceOverrides[key];
        const referenceValue = referenceFields[key];

        if (overrideValue === undefined || overrideValue === null) {
          return;
        }

        if (typeof overrideValue === 'string') {
          const trimmedOverride = overrideValue.trim();
          if (!trimmedOverride) {
            return;
          }

          if (typeof referenceValue === 'string' && referenceValue.trim() === trimmedOverride) {
            return;
          }

          (preferredReferenceFields as Record<string, unknown>)[key] = trimmedOverride;
          return;
        }

        if (overrideValue !== referenceValue) {
          (preferredReferenceFields as Record<string, unknown>)[key] = overrideValue;
        }
      });

      const clone: Partial<ItemFormData> = {
        ...basicInfo,
        ...preferredReferenceFields,
        Artikelbeschreibung:
          preferredReferenceFields.Artikelbeschreibung ?? basicInfo.Artikelbeschreibung ?? referenceFields.Artikelbeschreibung,
        Artikel_Nummer:
          preferredReferenceFields.Artikel_Nummer ?? basicInfo.Artikel_Nummer ?? referenceFields.Artikel_Nummer,
        Kurzbeschreibung:
          preferredReferenceFields.Kurzbeschreibung ?? basicInfo.Kurzbeschreibung ?? referenceFields.Kurzbeschreibung,
        Auf_Lager: basicInfo.Auf_Lager
      };

      if (typeof clone.Artikelbeschreibung === 'string') {
        clone.Artikelbeschreibung = clone.Artikelbeschreibung.trim();
      }
      if ('ItemUUID' in clone) {
        delete clone.ItemUUID;
      }
      console.log('Creating item from selected duplicate', {
        artikelNummer: item.Artikel_Nummer,
        exemplarItemUUID: item.exemplarItemUUID,
        resolvedDescription: clone.Artikelbeschreibung,
        useAgenticFlow: shouldUseAgenticForm
      });

      if (shouldUseAgenticForm) {
        moveToAgenticPhotos(clone, 'match-selection');
        return;
      }

      await submitNewItem(clone, 'match-selection');
    } catch (err) {
      console.error('Failed to create item from duplicate selection', err);
    }
  };

  const handleSkipMatches = () => {
    console.log('No duplicate selected, determining next creation step', { useAgenticFlow: shouldUseAgenticForm });

    if (shouldUseAgenticForm) {
      try {
        moveToAgenticPhotos(basicInfo, 'skip-matches');
      } catch (err) {
        console.error('Falling back to manual edit after agentic transition failure', err);
        setManualDraft((prev) => ({ ...prev, ...basicInfo }));
        setCreationStep('manualEdit');
      }
      return;
    }

    setManualDraft((prev) => ({ ...prev, ...basicInfo }));
    setCreationStep('manualEdit');
  };

  const handleManualSubmit = async (data: Partial<ItemFormData>) => {
    console.log('Submitting manual edit item details', data);
    if (creating) {
      console.warn('Skipping manual submit; creation already running.');
      return;
    }
    try {
      const merged = buildManualSubmissionPayload({
        basicInfo,
        manualData: data
      });
      console.log('Prepared manual submission payload', merged);
      await submitNewItem(merged, 'manual-edit');
    } catch (err) {
      console.error('Failed to prepare manual edit payload', err);
      throw err;
    }
  };

  const handleAgenticPhotos = async (data: Partial<ItemFormData>) => {
    console.log('Submitting agentic photo payload', {
      hasPicture1: Boolean(data.picture1),
      hasPicture2: Boolean(data.picture2),
      hasPicture3: Boolean(data.picture3)
    });

    if (creating) {
      console.warn('Skipping agentic photo submit; creation already running.');
      return;
    }

    try {
      const mergedData: Partial<ItemFormData> = {
        ...baseDraft,
        ...data,
        agenticStatus: 'running',
        agenticSearch:
          baseDraft.agenticSearch ||
          baseDraft.Artikelbeschreibung ||
          (typeof data.Artikelbeschreibung === 'string' ? data.Artikelbeschreibung : undefined)
      };

      if ('ItemUUID' in mergedData) {
        delete (mergedData as Record<string, unknown>).ItemUUID;
      }

      await submitNewItem(mergedData, 'agentic-photos');
    } catch (err) {
      console.error('Failed to submit agentic photo payload', err);
      throw err;
    }
  };

  const manualLockedFields = useMemo<LockedFieldConfig>(
    () => ({ ...MANUAL_CREATION_LOCKS }),
    []
  );

  console.log('Rendering item create form', { creationStep, shouldUseAgenticForm });
  // TODO: if(isLoading) display loading state LoadingPage
  const blockingOverlay = creating ? (
    <div className="blocking-overlay" role="presentation">
      <div className="blocking-overlay__surface" role="dialog" aria-modal="true" aria-live="assertive">
        <LoadingPage message="Artikel wird gespeichert…" />
      </div>
    </div>
  ) : null;

  if (creationStep === 'basicInfo') {
    return (
      <>
        {blockingOverlay}
        <ItemBasicInfoForm initialValues={basicInfo} onSubmit={handleBasicInfoNext} />
      </>
    );
  }

  if (creationStep === 'matchSelection') {
    return (
      <>
        {blockingOverlay}
        <ItemMatchSelection
          searchTerm={basicInfo.Artikelbeschreibung || ''}
          onSelect={handleMatchSelection}
          onSkip={handleSkipMatches}
        />
      </>
    );
  }

  if (creationStep === 'agenticPhotos' && shouldUseAgenticForm) {
    return (
      <>
        {blockingOverlay}
        <ItemForm_Agentic
          draft={baseDraft}
          onSubmitPhotos={handleAgenticPhotos}
          submitLabel="Speichern & Ki Vervollständigung"
          isNew
          onFallbackToManual={handleAgenticFallback}
        />
      </>
    );
  }

  return (
    <>
      {blockingOverlay}
      <ItemForm
        item={manualDraft}
        onSubmit={handleManualSubmit}
        submitLabel="Speichern"
        isNew
        headerContent={
          <>
            <h2>Details ergänzen</h2>
            <p>Die Pflichtfelder wurden übernommen. Bitte ergänze bei Bedarf weitere Angaben.</p>
          </>
        }
        lockedFields={manualLockedFields}
      />
    </>
  );
}
