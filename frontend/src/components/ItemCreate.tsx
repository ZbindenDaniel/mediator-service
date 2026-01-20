import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Item, ItemRef } from '../../../models';
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_RUNNING,
  isItemEinheit,
  ItemEinheit
} from '../../../models';
import { ensureUser } from '../lib/user';
import { triggerAgenticRun as triggerAgenticRunRequest } from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemForm_Agentic from './ItemForm_agentic';
import ItemForm from './ItemForm';
import { ItemBasicInfoForm } from './ItemBasicInfoForm';
import { ItemMatchSelection } from './ItemMatchSelection';
import PrintLabelButton from './PrintLabelButton';
import { useDialog } from './dialog';
import LoadingPage from './LoadingPage';
import type { ItemFormData, LockedFieldConfig } from './forms/itemFormShared';
import { ITEM_FORM_DEFAULT_EINHEIT, extractReferenceFields } from './forms/itemFormShared';
import type { SimilarItem } from './forms/useSimilarItems';
import { requestPrintLabel } from '../utils/printLabelRequest';
import { AUTO_PRINT_ITEM_LABEL_CONFIG } from '../utils/printSettings';
import { logger } from '../utils/logger';

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
  triggerAgenticRunRequest: typeof triggerAgenticRunRequest;
  reportFailure: AgenticTriggerFailureReporter;
  alertFn: (message: string) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  onSkipped?: (itemId: string) => void;
}

export async function handleAgenticRunTrigger({
  agenticPayload,
  context,
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
    const result = await triggerAgenticRunRequest({ payload: agenticPayload, context });

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

export interface AgenticTriggerInvocationOptions {
  agenticPayload: AgenticRunTriggerPayload;
  context: string;
  shouldUseAgenticForm: boolean;
  backendDispatched?: boolean;
  triggerAgenticRunRequest: typeof triggerAgenticRunRequest;
  reportFailure: AgenticTriggerFailureReporter;
  alertFn: (message: string) => Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  onSkipped?: (itemId: string) => void;
  handleTrigger?: typeof handleAgenticRunTrigger;
}

export function maybeTriggerAgenticRun({
  agenticPayload,
  context,
  shouldUseAgenticForm,
  backendDispatched = false,
  triggerAgenticRunRequest,
  reportFailure,
  alertFn,
  logger = console,
  onSkipped,
  handleTrigger = handleAgenticRunTrigger
}: AgenticTriggerInvocationOptions): void {
  if (!shouldUseAgenticForm) {
    logger.info?.('Skipping agentic trigger because agentic form is not active', { context });
    return;
  }

  if (backendDispatched) {
    logger.info?.('Skipping agentic trigger because backend already dispatched run', { context });
    return;
  }

  try {
    logger.info?.('Scheduling asynchronous agentic trigger', { context });
    const triggerPromise = handleTrigger({
      agenticPayload,
      context,
      triggerAgenticRunRequest,
      reportFailure,
      alertFn,
      logger,
      onSkipped
    });

    triggerPromise.catch((err) => {
      logger.error?.('Unhandled error while processing agentic trigger', err);
    });
  } catch (err) {
    logger.error?.('Failed to start agentic trigger workflow', err);
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

  if (merged.agenticStatus == null) {
    merged.agenticStatus = AGENTIC_RUN_STATUS_NOT_STARTED;
  }

  merged.agenticManualFallback = true;

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
  delete (merged as Record<string, unknown>).agenticManualFallback;

  merged.agenticStatus = AGENTIC_RUN_STATUS_NOT_STARTED;
  merged.agenticManualFallback = true;

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
  actor?: string
) {
  const params = new URLSearchParams();
  const sanitized: Record<string, unknown> = { ...data };
  if (typeof sanitized.Artikelbeschreibung === 'string') {
    sanitized.Artikelbeschreibung = sanitized.Artikelbeschreibung.trim();
  }
  if (typeof sanitized.Artikel_Nummer === 'string') {
    sanitized.Artikel_Nummer = sanitized.Artikel_Nummer.trim();
  }
  if ('ItemUUID' in sanitized) {
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
  try {
    if (isItemEinheit(einheit)) {
      sanitized.Einheit = einheit;
    } else if (typeof einheit === 'string') {
      const trimmedEinheit = einheit.trim();
      if (isItemEinheit(trimmedEinheit)) {
        sanitized.Einheit = trimmedEinheit;
      } else {
        if (trimmedEinheit.length > 0) {
          console.warn('Invalid Einheit provided during item creation; falling back to default.', {
            provided: trimmedEinheit
          });
        }
        sanitized.Einheit = ITEM_FORM_DEFAULT_EINHEIT;
      }
    } else {
      if (einheit !== undefined) {
        console.warn('Unexpected Einheit type during item creation; falling back to default.', {
          providedType: typeof einheit
        });
      }
      sanitized.Einheit = ITEM_FORM_DEFAULT_EINHEIT;
    }
  } catch (error) {
    console.error('Failed to normalize Einheit for item creation payload; using default.', error);
    sanitized.Einheit = ITEM_FORM_DEFAULT_EINHEIT;
  }

  Object.entries(sanitized).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return params;
}

// TODO(agent): Consolidate Auf_Lager normalization across item creation flows once server-side validation is unified.
function resolveAufLagerInput({
  value,
  fallback,
  context
}: {
  value: unknown;
  fallback?: number;
  context: string;
}): number {
  const candidate = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  if (fallback !== undefined && Number.isFinite(fallback) && fallback > 0) {
    console.warn('Invalid Auf_Lager input; falling back to prior value.', { context, value, fallback });
    return fallback;
  }
  console.warn('Invalid Auf_Lager input; defaulting to 1.', { context, value });
  return 1;
}

// TODO(agent): Confirm auto-print target resolution once bulk label handling is validated with operations.
function resolveAutoPrintEinheit(value: unknown): ItemEinheit {
  if (isItemEinheit(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isItemEinheit(trimmed)) {
      return trimmed;
    }
  }
  return ITEM_FORM_DEFAULT_EINHEIT;
}

function resolveAutoPrintTargets(options: {
  createdItem?: Item;
  responseItems: Array<{ ItemUUID?: string | null }>;
  einheit: ItemEinheit;
}): { mode: 'bulk' | 'instance'; itemIds: string[] } {
  const itemIds = new Set<string>();

  for (const entry of options.responseItems) {
    const raw = typeof entry?.ItemUUID === 'string' ? entry.ItemUUID.trim() : '';
    if (raw) {
      itemIds.add(raw);
    }
  }

  const fallbackId = typeof options.createdItem?.ItemUUID === 'string' ? options.createdItem.ItemUUID.trim() : '';
  if (fallbackId) {
    itemIds.add(fallbackId);
  }

  if (options.einheit === ItemEinheit.Menge) {
    if (fallbackId) {
      return { mode: 'bulk', itemIds: [fallbackId] };
    }
    const firstId = itemIds.values().next().value;
    return { mode: 'bulk', itemIds: firstId ? [firstId] : [] };
  }

  return { mode: 'instance', itemIds: Array.from(itemIds) };
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

  useEffect(() => {
    let cancelled = false;

    async function checkAgenticHealth() {
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
  }, []);

  const baseDraft = useMemo(
    () => ({
      ...draft
    }),
    [draft]
  );

  const moveToAgenticPhotos = useCallback(
    (data: Partial<ItemFormData>, source: 'skip-matches') => {
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
            agenticStatus: undefined,
            agenticManualFallback: undefined
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
          delete (nextDraft as Record<string, unknown>).agenticManualFallback;
          nextDraft.agenticStatus = AGENTIC_RUN_STATUS_NOT_STARTED;
          nextDraft.agenticManualFallback = true;
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
                  agenticSearch: updatedRun.SearchQuery || prev.agenticSearch,
                  agenticManualFallback: undefined
                }
              : prev
          );
        } else {
          setDraft((prev) =>
            prev.ItemUUID === itemId
              ? { ...prev, agenticStatus: undefined, agenticManualFallback: undefined }
              : prev
          );
        }
      } else {
        console.error('Agentic failure reporting endpoint returned non-OK status', res.status);
        setDraft((prev) =>
          prev.ItemUUID === itemId
            ? { ...prev, agenticStatus: undefined, agenticManualFallback: undefined }
            : prev
        );
      }
    } catch (failureErr) {
      console.error('Failed to report agentic trigger failure', failureErr);
      setDraft((prev) =>
        prev.ItemUUID === itemId
          ? { ...prev, agenticStatus: undefined, agenticManualFallback: undefined }
          : prev
      );
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
                  agenticSearch: refreshedRun.SearchQuery || prev.agenticSearch,
                  agenticManualFallback: undefined
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

  function triggerAgenticRun(
    agenticPayload: AgenticRunTriggerPayload,
    context: string,
    options: { backendDispatched?: boolean } = {}
  ) {
    maybeTriggerAgenticRun({
      agenticPayload,
      context,
      shouldUseAgenticForm,
      backendDispatched: options.backendDispatched,
      triggerAgenticRunRequest,
      reportFailure: reportAgenticTriggerFailure,
      alertFn: showAgenticAlert,
      logger: console,
      onSkipped: (itemId) => {
        setDraft((prev) =>
          prev.ItemUUID === itemId
            ? { ...prev, agenticStatus: undefined, agenticManualFallback: undefined }
            : prev
        );
      }
    });
  }

  async function submitNewItem(
    data: Partial<ItemFormData>,
    context: string
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

    const submissionData: Partial<ItemFormData> = {
      ...data
    };
    submissionData.Auf_Lager = resolveAufLagerInput({
      value: submissionData.Auf_Lager,
      fallback: typeof basicInfo.Auf_Lager === 'number' ? basicInfo.Auf_Lager : undefined,
      context
    });

    const matchSelectionContext = context === 'match-selection';
    let isManualSubmission = !shouldUseAgenticForm || context === 'manual-edit';
    try {
      if (matchSelectionContext && shouldUseAgenticForm) {
        console.info('Processing match selection with agentic workflow enabled.', {
          normalizedBoxId,
          hasReferenceDescription: Boolean(submissionData.Artikelbeschreibung)
        });
        isManualSubmission = false;
        submissionData.agenticStatus = submissionData.agenticStatus ?? AGENTIC_RUN_STATUS_RUNNING;
        if ('agenticManualFallback' in submissionData) {
          delete (submissionData as Record<string, unknown>).agenticManualFallback;
        }
        if (
          typeof submissionData.agenticSearch !== 'string' &&
          typeof submissionData.Artikelbeschreibung === 'string'
        ) {
          submissionData.agenticSearch = submissionData.Artikelbeschreibung.trim();
        }
      } else {
        isManualSubmission = !shouldUseAgenticForm || context === 'manual-edit' || matchSelectionContext;
        if (isManualSubmission) {
          submissionData.agenticStatus = AGENTIC_RUN_STATUS_NOT_STARTED;
          submissionData.agenticManualFallback = true;
        }
      }
    } catch (modeResolutionError) {
      console.error('Failed to resolve submission mode; defaulting to manual fallback.', modeResolutionError);
      isManualSubmission = true;
      submissionData.agenticStatus = AGENTIC_RUN_STATUS_NOT_STARTED;
      submissionData.agenticManualFallback = true;
    }

    if (typeof submissionData.Artikelbeschreibung === 'string') {
      const trimmedDescription = submissionData.Artikelbeschreibung.trim();
      submissionData.Artikelbeschreibung = trimmedDescription;
    }

    const params = buildCreationParams(submissionData, actor);
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

      // TODO(item-create): Revalidate multi-instance response parsing once item creation API evolves.
      let body: unknown = null;
      try {
        body = await response.json();
      } catch (parseError) {
        console.error('Failed to parse item creation response payload', parseError);
      }

      let createdItem: Item | undefined;
      let responseItems: Array<{ ItemUUID?: string | null }> = [];
      let createdCount: number | null = null;
      let backendDispatched = false;
      try {
        if (body && typeof body === 'object') {
          const payload = body as {
            item?: Item;
            items?: Array<{ ItemUUID?: string | null }>;
            createdCount?: number;
            agenticTriggerDispatched?: boolean;
          };
          createdItem = payload.item;
          if (Array.isArray(payload.items)) {
            responseItems = payload.items;
          }
          if (typeof payload.createdCount === 'number') {
            createdCount = payload.createdCount;
          }
          backendDispatched = payload.agenticTriggerDispatched === true;
        }
      } catch (payloadError) {
        console.error('Failed to read item creation response payload', {
          error: payloadError,
          body
        });
      }
      const searchText = (createdItem?.Artikelbeschreibung || submissionData.Artikelbeschreibung || '')
        .toString()
        .trim();
      if (backendDispatched) {
        console.info('Skipping client-side agentic trigger because backend already dispatched.', { context });
      }

      if (responseItems.length > 1 || (createdCount ?? 0) > 1) {
        const itemIds = responseItems
          .map((item) => (typeof item?.ItemUUID === 'string' ? item.ItemUUID.trim() : ''))
          .filter(Boolean);
        console.info('Multiple item instances created via import response', {
          createdCount: createdCount ?? responseItems.length,
          itemIds,
          navigationTarget: createdItem?.ItemUUID ?? null
        });
      }

      if (isManualSubmission) {
        console.info('Manual submission detected; skipping agentic trigger dispatch.', {
          context,
          backendDispatched
        });
      } else {
        const agenticPayload: AgenticRunTriggerPayload = {
          itemId: createdItem?.ItemUUID,
          artikelbeschreibung: searchText
        };

        try {
          console.info('Attempting to trigger agentic workflow after item creation', {
            context,
            backendDispatched,
            hasSearchText: Boolean(agenticPayload.artikelbeschreibung)
          });
          triggerAgenticRun(agenticPayload, context, { backendDispatched });
        } catch (triggerErr) {
          console.error('Failed to schedule agentic trigger after item creation', triggerErr);
        }
      }

      // TODO(agent): Validate auto-print behavior against production printers once enabled.
      if (AUTO_PRINT_ITEM_LABEL_CONFIG.enabled) {
        const einheit = resolveAutoPrintEinheit(submissionData.Einheit);
        const autoPrintTargets = resolveAutoPrintTargets({
          createdItem,
          responseItems,
          einheit
        });
        try {
          const printActor = (await ensureUser()).trim();
          if (!printActor) {
            console.warn('Auto-print skipped: no actor resolved for item label', {
              itemId: createdItem?.ItemUUID,
              autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG
            });
          } else {
            if (!autoPrintTargets.itemIds.length) {
              console.warn('Auto-print skipped: no item ids resolved for print targets', {
                autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG,
                mode: autoPrintTargets.mode,
                einheit,
                createdItemId: createdItem?.ItemUUID
              });
            } else {
              const failures: Array<{ itemId: string; status?: number; error?: unknown }> = [];
              for (const itemId of autoPrintTargets.itemIds) {
                try {
                  const printResult = await requestPrintLabel({
                    itemId,
                    actor: printActor
                  });
                  if (!printResult.ok) {
                    failures.push({
                      itemId,
                      status: printResult.status,
                      error: printResult.data.error || printResult.data.reason
                    });
                    console.error('Auto-print item label failed', {
                      itemId,
                      autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG,
                      status: printResult.status,
                      error: printResult.data.error || printResult.data.reason
                    });
                  }
                } catch (printError) {
                  failures.push({ itemId, error: printError });
                  console.error('Auto-print item label failed unexpectedly', {
                    itemId,
                    autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG,
                    error: printError
                  });
                }
              }
              if (failures.length > 0) {
                console.warn('Auto-print completed with partial failures', {
                  autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG,
                  failures,
                  mode: autoPrintTargets.mode,
                  attempted: autoPrintTargets.itemIds.length
                });
              }
            }
          }
        } catch (autoPrintError) {
          console.error('Auto-print item label failed unexpectedly', {
            itemId: createdItem?.ItemUUID,
            autoPrintConfig: AUTO_PRINT_ITEM_LABEL_CONFIG,
            error: autoPrintError
          });
        }
      }

      const successMessage =
        normalizedBoxId && createdItem?.BoxID
          ? `Artikel wurde erfasst und dem Behälter ${createdItem.BoxID} zugeordnet.`
          : 'Artikel wurde erfasst und ist noch keinem Behälter zugeordnet. Bitte platzieren!';

      // TODO(agent): Confirm modal print logging remains consistent after dialog copy updates.
      const dialogMessage = !AUTO_PRINT_ITEM_LABEL_CONFIG.enabled && createdItem?.ItemUUID ? (
        <>
          <p>{successMessage}</p>
          <PrintLabelButton
            itemId={createdItem.ItemUUID}
            onPrintStart={({ itemId }) => {
              logger.info?.('Item create modal print requested', { itemId });
            }}
          />
        </>
      ) : (
        successMessage
      );

      let shouldNavigateToCreatedItem = Boolean(createdItem?.ItemUUID);
      try {
        // TODO(agent): Revisit success dialog layout after richer metadata and label actions land.
        // TODO(agent): Confirm success dialog metadata stays aligned with backend import response fields.
        let dialogMessage: React.ReactNode = successMessage;
        try {
          let artikelNummerRaw = createdItem?.Artikel_Nummer;
          try {
            if (!artikelNummerRaw) {
              console.warn('Missing Artikel_Nummer in create response; falling back to submitted data.', {
                itemId: createdItem?.ItemUUID,
                artikelNummerRaw: createdItem?.Artikel_Nummer
              });
              artikelNummerRaw = submissionData.Artikel_Nummer;
            }
          } catch (artikelNummerParseError) {
            console.error('Failed to resolve Artikel_Nummer for success dialog', {
              error: artikelNummerParseError,
              itemId: createdItem?.ItemUUID
            });
          }
          const itemIdRaw = createdItem?.ItemUUID;
          const artikelNummer =
            typeof artikelNummerRaw === 'string' && artikelNummerRaw.trim() ? artikelNummerRaw.trim() : '';
          const itemId = typeof itemIdRaw === 'string' && itemIdRaw.trim() ? itemIdRaw.trim() : '';

          if (!artikelNummer) {
            console.warn('Missing Artikel_Nummer for created item success dialog', {
              itemId: itemIdRaw,
              artikelNummerRaw
            });
          }

          if (!itemId) {
            console.warn('Missing ItemUUID for created item success dialog', { itemId: itemIdRaw });
          }

          dialogMessage = (
            <div className="stack">
              <div>{successMessage}</div>
              <div>Artikelnummer: {artikelNummer || 'Unbekannt'}</div>
              <div>
                {itemId ? (
                  <PrintLabelButton
                    itemId={itemId}
                    onPrintStart={({ itemId: modalItemId }) => {
                      logger.info?.('Item create modal print requested', { itemId: modalItemId });
                    }}
                  />
                ) : (
                  <span>Label drucken nicht verfügbar.</span>
                )}
              </div>
            </div>
          );
        } catch (messageError) {
          console.error('Failed to build item creation success dialog message', {
            error: messageError,
            itemId: createdItem?.ItemUUID,
            artikelNummer: createdItem?.Artikel_Nummer
          });
          dialogMessage = successMessage;
        }

        const goToCreatedItem = await dialog.confirm({
          title: 'Artikel erstellt',
          message: dialogMessage,
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
        console.log('Navigating to created item detail', {
          itemId: createdItem.ItemUUID,
          createdCount: createdCount ?? responseItems.length
        });
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
    // TODO(item-create): Confirm match selection payload maintains Einheit/Quality/Auf_Lager defaults across reference flows.
    // TODO: Capture metrics on match-selection agentic submissions to validate flow effectiveness.
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

      const basicEinheit = isItemEinheit(basicInfo.Einheit) ? basicInfo.Einheit : undefined;
      const referenceEinheit = isItemEinheit(referenceFields.Einheit) ? referenceFields.Einheit : undefined;
      const preferredEinheit = isItemEinheit(preferredReferenceFields.Einheit)
        ? preferredReferenceFields.Einheit
        : undefined;
      const resolvedEinheit = basicEinheit ?? preferredEinheit ?? referenceEinheit ?? ITEM_FORM_DEFAULT_EINHEIT;
      const resolvedQuality = Object.prototype.hasOwnProperty.call(basicInfo, 'Quality')
        ? basicInfo.Quality
        : referenceFields.Quality;
      const resolvedAufLager = resolveAufLagerInput({
        value: basicInfo.Auf_Lager,
        context: 'match-selection'
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
        Auf_Lager: resolvedAufLager,
        Quality: resolvedQuality,
        Einheit: resolvedEinheit
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
      logger.info('Match selection payload includes quality/unit fields', {
        Auf_Lager: clone.Auf_Lager,
        Quality: clone.Quality,
        Einheit: clone.Einheit
      });

      console.info('Submitting duplicate selection via legacy item creation flow.');

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
        agenticStatus: AGENTIC_RUN_STATUS_RUNNING,
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
