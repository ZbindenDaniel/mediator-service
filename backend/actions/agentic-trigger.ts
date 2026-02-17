import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { startAgenticRun, type AgenticServiceDependencies } from '../agentic';
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  normalizeAgenticRunStatus,
  type AgenticRunReviewMetadata
} from '../../models';
import { resolveAgenticRequestContext } from './agentic-request-context';
// TODO(agentic-start-flow): Extract shared agentic start/restart validation once UI start flows stabilize.

export interface AgenticRunTriggerPayload {
  // TODO(agentic-trigger-input): Reconfirm all callers send artikelNummer-only payloads post-migration.
  artikelNummer: string | null;
  artikelbeschreibung?: string | null;
  search?: string | null;
  actor?: string | null;
  review?: {
    decision?: string | null;
    information_present?: boolean | string | number | null;
    missing_spec?: unknown;
    unneeded_spec?: unknown;
    bad_format?: boolean | string | number | null;
    wrong_information?: boolean | string | number | null;
    wrong_physical_dimensions?: boolean | string | number | null;
    notes?: string | null;
    reviewedBy?: string | null;
  } | null;
  [key: string]: unknown;
}

export type AgenticTriggerSkippedReason =
  | 'missing-artikelbeschreibung'
  | 'missing-artikel-nummer';

export class AgenticTriggerValidationError extends Error {
  public readonly reason: AgenticTriggerSkippedReason;

  constructor(message: string, reason: AgenticTriggerSkippedReason) {
    super(message);
    this.name = 'AgenticTriggerValidationError';
    this.reason = reason;
  }
}

export interface AgenticTriggerForwardResult {
  ok: boolean;
  status: number;
  body: {
    status: 'triggered' | 'ignored' | 'error';
    message: string;
    reason?: string | null;
    agentic?: unknown;
  };
  rawBody: string | null;
}

export interface ForwardAgenticTriggerOptions {
  context?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  service?: AgenticServiceDependencies;
}

// TODO(agentic-trigger): Keep payloads Artikel_Nummer-only once upstream callers stop sending instance IDs.
export function buildAgenticRunRequestBody(payload: AgenticRunTriggerPayload) {
  const optionalPayload: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (
      key === 'artikelbeschreibung'
      || key === 'artikelNummer'
      || key === 'search'
      || key === 'itemId'
      || key === 'id'
      || key === 'itemUUid'
    ) {
      return;
    }
    if (value === undefined || value === null) {
      return;
    }
    optionalPayload[key] = typeof value === 'string' ? value.trim() : value;
  });

  const artikelbeschreibungCandidate =
    typeof payload.artikelbeschreibung === 'string' && payload.artikelbeschreibung.trim()
      ? payload.artikelbeschreibung.trim()
      : typeof payload.search === 'string' && payload.search.trim()
        ? payload.search.trim()
        : '';
  if (!artikelbeschreibungCandidate) {
    throw new AgenticTriggerValidationError(
      'Agentic trigger payload requires artikelbeschreibung',
      'missing-artikelbeschreibung'
    );
  }

  const resolvedArtikelNummer =
    typeof payload.artikelNummer === 'string' ? payload.artikelNummer.trim() : '';

  return {
    requestBody: {
      Artikelbeschreibung: artikelbeschreibungCandidate,
      ...optionalPayload
    },
    artikelbeschreibung: artikelbeschreibungCandidate,
    artikelNummer: resolvedArtikelNummer
  };
}

export async function forwardAgenticTrigger(
  payload: AgenticRunTriggerPayload,
  options: ForwardAgenticTriggerOptions = {}
): Promise<AgenticTriggerForwardResult> {
  const { context = 'server', logger = console, service: serviceDeps } = options;

  let artikelbeschreibung = '';
  let artikelNummer = '';
  try {
    ({ artikelbeschreibung, artikelNummer } = buildAgenticRunRequestBody(payload));
  } catch (err) {
    if (err instanceof AgenticTriggerValidationError) {
      logger.warn?.('[agentic-trigger] Validation failed before dispatch', {
        context,
        reason: err.reason,
        message: err.message
      });
    }
    throw err;
  }
  if (!artikelNummer) {
    throw new AgenticTriggerValidationError(
      'Agentic trigger payload requires an Artikelnummer',
      'missing-artikel-nummer'
    );
  }

  logger.info?.('[agentic-trigger] Using Artikel_Nummer for agentic trigger', {
    artikelNummer,
    context
  });

  const requestContext = resolveAgenticRequestContext(payload, artikelNummer);
  const actor = typeof payload.actor === 'string' && payload.actor.trim() ? payload.actor.trim() : null;
  const review = normalizeReviewMetadata(payload.review);
  if (!serviceDeps) {
    throw new Error('Agentic service dependencies are required');
  }

  // TODO(agentic-trigger-prestart): Reuse this active-run preflight check with restart/queue actions if duplicate conflicts increase.
  try {
    const existingRun = typeof serviceDeps.getAgenticRun?.get === 'function'
      ? (serviceDeps.getAgenticRun.get(artikelNummer) as { Status?: string | null } | undefined)
      : undefined;
    const normalizedStatus = normalizeAgenticRunStatus(existingRun?.Status ?? null);
    if (existingRun && AGENTIC_RUN_ACTIVE_STATUSES.has(normalizedStatus)) {
      const reason = 'run-already-in-progress';
      logger.warn?.('[agentic-trigger] Ignored duplicate start attempt for active run', {
        context,
        artikelNummer,
        status: normalizedStatus,
        reason
      });
      return {
        ok: false,
        status: 409,
        body: {
          status: 'ignored',
          message: 'Agentic run already in progress',
          reason
        },
        rawBody: null
      };
    }
  } catch (err) {
    const reason = 'run-state-conflict';
    logger.error?.('[agentic-trigger] Failed to resolve pre-start run state', {
      context,
      artikelNummer,
      reason,
      error: err instanceof Error ? err.message : 'unknown-error'
    });
    return {
      ok: false,
      status: 409,
      body: {
        status: 'error',
        message: 'Unable to validate current run state before start',
        reason
      },
      rawBody: null
    };
  }

  try {
    const result = await startAgenticRun(
      {
        itemId: artikelNummer,
        searchQuery: artikelbeschreibung,
        actor,
        review,
        context,
        request: requestContext
      },
      {
        ...serviceDeps,
        logger: serviceDeps.logger ?? options.logger ?? console
      }
    );

    if (!result.queued) {
      const reason = result.reason ?? 'start-declined';
      logger.warn?.('[agentic-trigger] Agentic run start declined', {
        context,
        artikelNummer,
        reason
      });
      return {
        ok: false,
        status: 409,
        body: {
          status: reason === 'already-exists' ? 'ignored' : 'error',
          message: reason === 'already-exists'
            ? 'Agentic run already exists for this Artikel_Nummer'
            : 'Agentic run start declined',
          reason
        },
        rawBody: null
      };
    }

    logger.info?.('[agentic-trigger] Agentic run queued locally', {
      context,
      artikelNummer
    });
    return {
      ok: true,
      status: 202,
      body: {
        status: 'triggered',
        message: 'Agentic run queued',
        agentic: result.agentic
      },
      rawBody: null
    };
  } catch (err) {
    const reason = 'agentic-start-failed';
    logger.error?.('[agentic-trigger] Failed to start agentic run', {
      context,
      artikelNummer,
      reason,
      error: err instanceof Error ? err.message : 'unknown-error'
    });
    return {
      ok: false,
      status: 500,
      body: {
        status: 'error',
        message: 'Failed to start agentic run',
        reason
      },
      rawBody: null
    };
  }
}

function normalizeReviewMetadata(
  review: AgenticRunTriggerPayload['review']
): AgenticRunReviewMetadata | null {
  if (!review) {
    return null;
  }

  const normalizeField = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const normalizeNullableBoolean = (value: unknown): boolean | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return null;
    }
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
    return null;
  };

  const missingSpec = Array.isArray(review.missing_spec)
    ? review.missing_spec.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
  const unneededSpec = Array.isArray(review.unneeded_spec)
    ? review.unneeded_spec.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];

  return {
    decision: normalizeField(review.decision),
    information_present: normalizeNullableBoolean(review.information_present),
    missing_spec: missingSpec,
    unneeded_spec: unneededSpec,
    bad_format: normalizeNullableBoolean(review.bad_format),
    wrong_information: normalizeNullableBoolean(review.wrong_information),
    wrong_physical_dimensions: normalizeNullableBoolean(review.wrong_physical_dimensions),
    notes: normalizeField(review.notes),
    reviewedBy: normalizeField(review.reviewedBy)
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'agentic-trigger',
  label: 'Agentic trigger proxy',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/run' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
      }
    } catch (err) {
      console.error('[agentic-trigger] Failed to read request body', err);
      return sendJson(res, 400, { error: 'Invalid request body' });
    }

    if (!raw) {
      console.warn('[agentic-trigger] Empty request body received');
      return sendJson(res, 400, { error: 'Request body required' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('[agentic-trigger] Failed to parse JSON payload', err);
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }

    const contextLabel = typeof parsed?.context === 'string' ? parsed.context : 'api-proxy';
    const payload: AgenticRunTriggerPayload =
      parsed && typeof parsed === 'object' && parsed.payload && typeof parsed.payload === 'object'
        ? parsed.payload
        : parsed;

    try {
      const result = await forwardAgenticTrigger(payload, {
        context: contextLabel,
        logger: console,
        service: {
          db: ctx.db,
          getAgenticRun: ctx.getAgenticRun,
          getItemReference: ctx.getItemReference,
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          findByMaterial: ctx.findByMaterial,
          logger: console,
          now: () => new Date(),
          invokeModel: ctx.agenticInvokeModel
        }
      });

      if (result.ok) {
        return sendJson(res, result.status || 202, {
          ok: true,
          status: result.body.status,
          message: result.body.message,
          agentic: result.body.agentic ?? null
        });
      }

      return sendJson(res, result.status || 422, {
        error: 'Ki Aufruf fehlgeschlagen',
        status: result.body.status,
        message: result.body.message,
        reason: result.body.reason ?? null,
        details: result.body ?? result.rawBody
      });
    } catch (err) {
      if (err instanceof AgenticTriggerValidationError) {
        console.warn('[agentic-trigger] Validation error', { reason: err.reason });
        return sendJson(res, 400, { error: err.message, reason: err.reason });
      }
      console.error('[agentic-trigger] Unexpected error while triggering agentic run', err);
      return sendJson(res, 500, { error: 'Ki Aufruf fehlgeschlagen' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic trigger proxy API</p></div>'
});

export default action;
