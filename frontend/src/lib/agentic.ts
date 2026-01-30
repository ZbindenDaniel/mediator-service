import type { AgenticRun } from '../../../models';
import { logError, logger } from '../utils/logger';
// TODO(agentic-close): Confirm close endpoint payload once backend wiring lands.
// TODO(agentic-trigger-skip): Treat already-exists responses as non-failures in the UI.

// TODO(agentic-failure-reason): Surface backend failure reasons to UI consumers.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AGENTIC_FAILURE_REASON_DESCRIPTIONS: Record<string, string> = {
  'missing-search-query': 'Suchbegriff fehlt',
  'missing-artikel-nummer': 'Artikel_Nummer fehlt',
  'missing-artikelbeschreibung': 'Artikelbeschreibung fehlt',
  'agentic-start-failed': 'KI-Start fehlgeschlagen',
  'request-id-required': 'Anfrage-ID erforderlich',
  'request-log-load-failed': 'KI-Anfragelog konnte nicht geladen werden',
  'response-not-ok': 'Unerwartete Antwort vom KI-Dienst',
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
  artikelNummer: string | null;
  artikelbeschreibung?: string | null;
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
  | 'missing-artikel-nummer'
  | 'already-exists';

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

  const artikelNummerCandidate =
    typeof payload.artikelNummer === 'string' && payload.artikelNummer.trim()
      ? payload.artikelNummer.trim()
      : '';

  const artikelbeschreibungCandidate =
    typeof payload.artikelbeschreibung === 'string' && payload.artikelbeschreibung.trim()
      ? payload.artikelbeschreibung.trim()
      : typeof payload.search === 'string' && payload.search.trim()
        ? payload.search.trim()
        : '';

  if (!artikelbeschreibungCandidate) {
    const message = `KI-Auslösung übersprungen (${context}): fehlende Artikelbeschreibung`;
    console.warn(message);
    return { outcome: 'skipped', reason: 'missing-artikelbeschreibung', message };
  }

  const artikelNummer = artikelNummerCandidate;
  if (!artikelNummer) {
    const message = `KI-Auslösung übersprungen (${context}): fehlende Artikel_Nummer`;
    console.warn(message);
    return { outcome: 'skipped', reason: 'missing-artikel-nummer', message };
  }

  try {
    const optionalPayload: Record<string, unknown> = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'artikelbeschreibung' || key === 'artikelNummer') {
        return;
      }
      if (value === undefined || value === null) {
        return;
      }
      optionalPayload[key] = typeof value === 'string' ? value.trim() : value;
    });

    const backendPayload: AgenticRunTriggerPayload = {
      artikelbeschreibung: artikelbeschreibungCandidate,
      artikelNummer,
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
        console.warn(`KI-Auslösung fehlgeschlagen (${context}): non-JSON error payload`, jsonErr);
      }
      const extractedReason = extractAgenticFailureReason(errorDetails);
      const normalizedReason =
        typeof extractedReason === 'string' ? extractedReason.trim().toLowerCase() : null;
      if (normalizedReason === 'already-exists') {
        const message = `KI-Auslösung übersprungen (${context}): bereits vorhanden`;
        console.warn(`KI-Auslösung übersprungen (${context})`, {
          status: response.status,
          reason: normalizedReason
        });
        return {
          outcome: 'skipped',
          reason: 'already-exists',
          message
        };
      }
      console.error(`KI-Auslösung fehlgeschlagen (${context})`, response.status, errorDetails);
      const failureReason = describeAgenticFailureReason(extractedReason ?? 'response-not-ok');
      const message = formatAgenticFailureMessage(`KI-Auslösung fehlgeschlagen (${context})`, failureReason);
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
      console.warn(`KI-Auslösung (${context}) erfolgreich, Antwort nicht als JSON`, parseErr);
    }
    const agenticRun: AgenticRun | null = parsedBody?.agentic ?? null;

    return { outcome: 'triggered', status: response.status, agentic: agenticRun };
  } catch (err) {
    const failureReason = describeAgenticFailureReason('network-error');
    const message = formatAgenticFailureMessage(
      `KI-Auslösung fehlgeschlagen (${context})`,
      failureReason
    );
    console.error(message, err);
    return { outcome: 'failed', reason: 'network-error', message, error: err };
  }
}

export interface PersistAgenticRunCancellationOptions {
  artikelNummer: string | null | undefined;
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
  artikelNummer,
  actor,
  context
}: PersistAgenticRunCancellationOptions): Promise<PersistAgenticRunCancellationResult> {
  // TODO(agentic-endpoint-migration): Remove legacy ID guard once all callers pass Artikel_Nummer.
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!trimmedArtikelNummer) {
    const message = `KI-Abbruch übersprungen (${context}): fehlende Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer });
    return { ok: false, status: 400, agentic: null, message };
  }
  if (trimmedArtikelNummer.startsWith('I-') || !/^\d+$/.test(trimmedArtikelNummer)) {
    const message = `KI-Abbruch übersprungen (${context}): ungültige Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer: trimmedArtikelNummer });
    return { ok: false, status: 400, agentic: null, message };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';

  try {
    const response = await fetch(
      `/api/item-refs/${encodeURIComponent(trimmedArtikelNummer)}/agentic/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: sanitizedActor })
      }
    );

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `KI-Abbruch übersprungen (${context}): Lauf nicht gefunden`
        : `KI-Abbruch fehlgeschlagen (${context})`;
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
    const message = `KI-Abbruch fehlgeschlagen (${context})`;
    console.error(message, err);
    return { ok: false, status: 0, agentic: null, message };
  }
}

export interface PersistAgenticRunDeletionOptions {
  artikelNummer: string | null | undefined;
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
  artikelNummer,
  actor,
  reason,
  context
}: PersistAgenticRunDeletionOptions): Promise<PersistAgenticRunDeletionResult> {
  // TODO(agentic-endpoint-migration): Remove legacy ID guard once all callers pass Artikel_Nummer.
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!trimmedArtikelNummer) {
    const message = `KI-Löschung übersprungen (${context}): fehlende Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer });
    return { ok: false, status: 400, agentic: null, message, reason: 'missing-artikel-nummer' };
  }
  if (trimmedArtikelNummer.startsWith('I-') || !/^\d+$/.test(trimmedArtikelNummer)) {
    const message = `KI-Löschung übersprungen (${context}): ungültige Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer: trimmedArtikelNummer });
    return { ok: false, status: 400, agentic: null, message, reason: 'missing-artikel-nummer' };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';
  const sanitizedReason = reason && reason.trim() ? reason.trim() : null;

  try {
    const response = await fetch(
      `/api/item-refs/${encodeURIComponent(trimmedArtikelNummer)}/agentic/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: sanitizedActor, reason: sanitizedReason })
      }
    );

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `KI-Löschung übersprungen (${context}): Lauf nicht gefunden`
        : `KI-Löschung fehlgeschlagen (${context})`;
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
    const message = `KI-Löschung fehlgeschlagen (${context})`;
    console.error(message, err);
    return { ok: false, status: 0, agentic: null, message, reason: 'network-error' };
  }
}

export interface PersistAgenticRunCloseOptions {
  artikelNummer: string | null | undefined;
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
  artikelNummer,
  actor,
  notes,
  context
}: PersistAgenticRunCloseOptions): Promise<PersistAgenticRunCloseResult> {
  // TODO(agentic-endpoint-migration): Remove legacy ID guard once all callers pass Artikel_Nummer.
  const trimmedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!trimmedArtikelNummer) {
    const message = `KI-Abschluss übersprungen (${context}): fehlende Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer });
    return { ok: false, status: 400, agentic: null, message };
  }
  if (trimmedArtikelNummer.startsWith('I-') || !/^\d+$/.test(trimmedArtikelNummer)) {
    const message = `KI-Abschluss übersprungen (${context}): ungültige Artikel_Nummer`;
    logger.warn?.(message, { artikelNummer: trimmedArtikelNummer });
    return { ok: false, status: 400, agentic: null, message };
  }

  const sanitizedActor = actor && actor.trim() ? actor.trim() : 'system';
  const sanitizedNotes = notes && notes.trim() ? notes.trim() : null;

  try {
    const response = await fetch(
      `/api/item-refs/${encodeURIComponent(trimmedArtikelNummer)}/agentic/close`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: sanitizedActor, notes: sanitizedNotes })
      }
    );

    if (!response.ok) {
      const isNotFound = response.status === 404;
      const message = isNotFound
        ? `KI-Abschluss übersprungen (${context}): Lauf nicht gefunden`
        : `KI-Abschluss fehlgeschlagen (${context})`;
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
    const message = `KI-Abschluss fehlgeschlagen (${context})`;
    logError(message, err);
    return { ok: false, status: 0, agentic: null, message };
  }
}
