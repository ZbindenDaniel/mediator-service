import type { AgenticRun } from '../../../models';
import { logError, logger } from '../utils/logger';
// TODO(agentic-close): Confirm close endpoint payload once backend wiring lands.

// TODO(agentic-failure-reason): Surface backend failure reasons to UI consumers.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AGENTIC_FAILURE_REASON_DESCRIPTIONS: Record<string, string> = {
  'missing-search-query': 'Suchbegriff fehlt',
  'missing-item-id': 'ItemUUID fehlt',
  'missing-artikelbeschreibung': 'Artikelbeschreibung fehlt',
  'agentic-start-failed': 'Agentischer Start fehlgeschlagen',
  'request-id-required': 'Anfrage-ID erforderlich',
  'request-log-load-failed': 'Agentic-Anfragelog konnte nicht geladen werden',
  'response-not-ok': 'Unerwartete Antwort vom Agentic-Dienst',
  'network-error': 'Netzwerkfehler',
};

export function extractAgenticFailureReason(details: unknown): string | null {
  if (isRecord(details)) {
    const directReason = details.reason;
    if (typeof directReason === 'string' && directReason.trim()) {
      return directReason.trim();
    }

    const nestedError = details.error;
    if (typeof nestedError === 'string' && nestedError.trim()) {
      return nestedError.trim();
    }
    if (isRecord(nestedError)) {
      const nestedReason = extractAgenticFailureReason(nestedError);
      if (nestedReason) {
        return nestedReason;
      }
    }
  }

  if (typeof details === 'string' && details.trim()) {
    return details.trim();
  }

  return null;
}

export function describeAgenticFailureReason(reason: string | null | undefined): string | null {
  if (!reason || typeof reason !== 'string') {
    return null;
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  return AGENTIC_FAILURE_REASON_DESCRIPTIONS[normalized] ?? trimmed;
}

function formatAgenticFailureMessage(base: string, reasonDescription: string | null): string {
  return reasonDescription ? `${base}. Grund: ${reasonDescription}` : base;
}

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
  actor?: string | null;
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
  | { outcome: 'triggered'; status: number; agentic?: AgenticRun | null }
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
      const failureReason = describeAgenticFailureReason(
        extractAgenticFailureReason(errorDetails) ?? 'response-not-ok'
      );
      const message = formatAgenticFailureMessage(
        `Agentic trigger failed during ${context}`,
        failureReason
      );
      return {
        outcome: 'failed',
        reason: 'response-not-ok',
        status: response.status,
        message,
        error: errorDetails
      };
    }

    let parsedBody: any = null;
    try {
      parsedBody = await response.json();
    } catch (parseErr) {
      console.warn(`Agentic trigger (${context}) succeeded but response body was not JSON`, parseErr);
    }
    const agenticRun: AgenticRun | null = parsedBody?.agentic ?? null;

    return { outcome: 'triggered', status: response.status, agentic: agenticRun };
  } catch (err) {
    const failureReason = describeAgenticFailureReason('network-error');
    const message = formatAgenticFailureMessage(
      `Agentic trigger invocation failed during ${context}`,
      failureReason
    );
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

export interface PersistAgenticRunDeletionOptions {
  itemId: string | null | undefined;
  actor?: string | null;
  reason?: string | null;
  context: string;
}

export interface PersistAgenticRunDeletionResult {
  ok: boolean;
  status: number;
  agentic: AgenticRun | null;
  message?: string;
  reason?: string | null;
}

export async function persistAgenticRunDeletion({
  itemId,
  actor,
  reason,
  context
}: PersistAgenticRunDeletionOptions): Promise<PersistAgenticRunDeletionResult> {
  const trimmedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmedItemId) {
    const message = `Agentic delete skipped (${context}): missing ItemUUID`;
    console.warn(message);
    return { ok: false, status: 400, agentic: null, message, reason: 'missing-item-id' };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';
  const sanitizedReason = reason && reason.trim() ? reason.trim() : null;

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(trimmedItemId)}/agentic/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: sanitizedActor, reason: sanitizedReason })
    });

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `Agentic delete skipped during ${context}: run not found`
        : `Agentic delete failed during ${context}`;
      const logger = isNotFound ? console.warn : console.error;
      logger(message, response.status);
      return {
        ok: false,
        status: response.status,
        agentic: null,
        message,
        reason: isNotFound ? 'not-found' : 'request-failed'
      };
    }

    const data = await response
      .json()
      .catch((err) => {
        console.error('Failed to parse persisted agentic delete response', err);
        return null;
      });

    const agenticRun: AgenticRun | null = data?.agentic ?? null;
    return { ok: true, status: response.status, agentic: agenticRun };
  } catch (err) {
    const message = `Agentic delete request threw during ${context}`;
    console.error(message, err);
    return { ok: false, status: 0, agentic: null, message, reason: 'network-error' };
  }
}

export interface PersistAgenticRunCloseOptions {
  itemId: string | null | undefined;
  actor?: string | null;
  notes?: string | null;
  context: string;
}

export interface PersistAgenticRunCloseResult {
  ok: boolean;
  status: number;
  agentic: AgenticRun | null;
  message?: string;
}

export async function persistAgenticRunClose({
  itemId,
  actor,
  notes,
  context
}: PersistAgenticRunCloseOptions): Promise<PersistAgenticRunCloseResult> {
  const trimmedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!trimmedItemId) {
    const message = `Agentic close skipped (${context}): missing ItemUUID`;
    logger.warn?.(message);
    return { ok: false, status: 400, agentic: null, message };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';
  const sanitizedNotes = notes && notes.trim() ? notes.trim() : null;

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(trimmedItemId)}/agentic/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: sanitizedActor, notes: sanitizedNotes })
    });

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `Agentic close skipped during ${context}: run not found`
        : `Agentic close failed during ${context}`;
      const loggerFn = isNotFound ? logger.warn : logger.error;
      loggerFn?.(message, { status: response.status });
      return { ok: false, status: response.status, agentic: null, message };
    }

    const data = await response
      .json()
      .catch((err) => {
        logError('Failed to parse persisted agentic close response', err);
        return null;
      });

    const agenticRun: AgenticRun | null = data?.agentic ?? null;
    return { ok: true, status: response.status, agentic: agenticRun };
  } catch (err) {
    const message = `Agentic close request threw during ${context}`;
    logError(message, err);
    return { ok: false, status: 0, agentic: null, message };
  }
}
