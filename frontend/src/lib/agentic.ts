import type { AgenticRun } from '../../../models';

export interface AgenticRunTriggerPayload {
  itemId?: string | null;
  artikelbeschreibung?: string | null;
  /**
   * @deprecated Temporary support for legacy payloads while the UI transitions to the
   *             new agent service contract.
   */
  id?: string | null;
  /**
   * @deprecated Temporary support for legacy payloads while the UI transitions to the
   *             new agent service contract.
   */
  search?: string | null;
  review?: {
    decision?: string | null;
    notes?: string | null;
    reviewedBy?: string | null;
  } | null;
}

const DEFAULT_AGENTIC_RUN_ENDPOINT = '/api/agentic/run';

export interface AgenticRunTriggerOptions {
  payload: AgenticRunTriggerPayload;
  context: string;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
}

export type AgenticTriggerSkippedReason =
  | 'run-url-missing'
  | 'missing-artikelbeschreibung'
  | 'missing-item-id';

export type AgenticTriggerFailedReason = 'response-not-ok' | 'network-error';

export type AgenticTriggerResult =
  | { outcome: 'triggered'; status: number }
  | { outcome: 'skipped'; reason: AgenticTriggerSkippedReason; message: string }
  | {
      outcome: 'failed';
      reason: AgenticTriggerFailedReason;
      status?: number;
      message: string;
      error?: unknown;
    };

export async function triggerAgenticRun({
  payload,
  context,
  endpoint = DEFAULT_AGENTIC_RUN_ENDPOINT,
  fetchImpl = fetch
}: AgenticRunTriggerOptions): Promise<AgenticTriggerResult> {
  const runUrl = typeof endpoint === 'string' && endpoint.trim() ? endpoint.trim() : DEFAULT_AGENTIC_RUN_ENDPOINT;

  const itemIdCandidate =
    typeof payload.itemId === 'string' && payload.itemId.trim()
      ? payload.itemId.trim()
      : typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : '';

  const artikelbeschreibungCandidate =
    typeof payload.artikelbeschreibung === 'string' && payload.artikelbeschreibung.trim()
      ? payload.artikelbeschreibung.trim()
      : typeof payload.search === 'string' && payload.search.trim()
        ? payload.search.trim()
        : '';

  if (!artikelbeschreibungCandidate) {
    const message = `Agentic trigger skipped (${context}): missing Artikelbeschreibung`;
    console.warn(message);
    return { outcome: 'skipped', reason: 'missing-artikelbeschreibung', message };
  }

  const itemId = itemIdCandidate;
  if (!itemId) {
    const message = `Agentic trigger skipped (${context}): missing ItemUUID`;
    console.warn(message);
    return { outcome: 'skipped', reason: 'missing-item-id', message };
  }

  try {
    const optionalPayload: Record<string, unknown> = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'artikelbeschreibung' || key === 'itemId') {
        return;
      }
      if (value === undefined || value === null) {
        return;
      }
      optionalPayload[key] = typeof value === 'string' ? value.trim() : value;
    });

    const backendPayload: AgenticRunTriggerPayload = {
      artikelbeschreibung: artikelbeschreibungCandidate,
      itemId,
      ...optionalPayload
    };

    const response = await fetchImpl(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, payload: backendPayload })
    });
    if (!response.ok) {
      let errorDetails: unknown = null;
      try {
        errorDetails = await response.clone().json();
      } catch (jsonErr) {
        try {
          errorDetails = await response.text();
        } catch (textErr) {
          errorDetails = { message: 'Failed to read response body', cause: textErr };
        }
        console.warn(`Agentic trigger failed during ${context}: non-JSON error payload`, jsonErr);
      }
      console.error(`Agentic trigger failed during ${context}`, response.status, errorDetails);
      const message = `Agentic trigger failed during ${context}`;
      return {
        outcome: 'failed',
        reason: 'response-not-ok',
        status: response.status,
        message,
        error: errorDetails
      };
    }
    return { outcome: 'triggered', status: response.status };
  } catch (err) {
    const message = `Agentic trigger invocation failed during ${context}`;
    console.error(message, err);
    return { outcome: 'failed', reason: 'network-error', message, error: err };
  }
}

export interface PersistAgenticRunCancellationOptions {
  itemId: string | null | undefined;
  actor?: string | null;
  context: string;
}

export interface PersistAgenticRunCancellationResult {
  ok: boolean;
  status: number;
  agentic: AgenticRun | null;
  message?: string;
}

export async function persistAgenticRunCancellation({
  itemId,
  actor,
  context
}: PersistAgenticRunCancellationOptions): Promise<PersistAgenticRunCancellationResult> {
  const trimmedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmedItemId) {
    const message = `Agentic cancel skipped (${context}): missing ItemUUID`;
    console.warn(message);
    return { ok: false, status: 400, agentic: null, message };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(trimmedItemId)}/agentic/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: sanitizedActor })
    });

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `Agentic cancel skipped during ${context}: run not found`
        : `Agentic cancel failed during ${context}`;
      const logger = isNotFound ? console.warn : console.error;
      logger(message, response.status);
      return { ok: false, status: response.status, agentic: null, message };
    }

    const data = await response
      .json()
      .catch((err) => {
        console.error('Failed to parse persisted agentic cancel response', err);
        return null;
      });

    const agenticRun: AgenticRun | null = data?.agentic ?? null;
    return { ok: true, status: response.status, agentic: agenticRun };
  } catch (err) {
    const message = `Agentic cancel request threw during ${context}`;
    console.error(message, err);
    return { ok: false, status: 0, agentic: null, message };
  }
}
