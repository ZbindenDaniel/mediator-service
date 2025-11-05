import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { startAgenticRun, type AgenticServiceDependencies } from '../agentic';

export interface AgenticRunTriggerPayload {
  itemId?: string | null;
  artikelbeschreibung?: string | null;
  id?: string | null;
  search?: string | null;
  review?: {
    decision?: string | null;
    notes?: string | null;
    reviewedBy?: string | null;
  } | null;
  [key: string]: unknown;
}

export type AgenticTriggerSkippedReason = 'missing-artikelbeschreibung' | 'missing-item-id';

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
  body: unknown;
  rawBody: string | null;
}

export interface ForwardAgenticTriggerOptions {
  context?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  service?: AgenticServiceDependencies;
}

export function buildAgenticRunRequestBody(payload: AgenticRunTriggerPayload) {
  const optionalPayload: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'artikelbeschreibung' || key === 'itemId' || key === 'id' || key === 'search') {
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

  const itemIdCandidate =
    typeof payload.itemId === 'string' && payload.itemId.trim()
      ? payload.itemId.trim()
      : typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : '';
  if (!itemIdCandidate) {
    throw new AgenticTriggerValidationError('Agentic trigger payload requires itemId', 'missing-item-id');
  }

  return {
    requestBody: {
      Artikelbeschreibung: artikelbeschreibungCandidate,
      itemUUid: itemIdCandidate,
      ...optionalPayload
    },
    artikelbeschreibung: artikelbeschreibungCandidate,
    itemId: itemIdCandidate
  };
}

export async function forwardAgenticTrigger(
  payload: AgenticRunTriggerPayload,
  options: ForwardAgenticTriggerOptions = {}
): Promise<AgenticTriggerForwardResult> {
  const { context = 'server', logger = console, service: serviceDeps } = options;

  const { artikelbeschreibung, itemId } = buildAgenticRunRequestBody(payload);
  if (!serviceDeps) {
    throw new Error('Agentic service dependencies are required');
  }

  try {
    const result = await startAgenticRun(
      {
        itemId,
        searchQuery: artikelbeschreibung,
        review: payload.review ?? null,
        context
      },
      {
        ...serviceDeps,
        logger: serviceDeps.logger ?? options.logger ?? console
      }
    );

    if (!result.queued) {
      logger.warn?.('[agentic-trigger] Agentic run start declined', {
        context,
        itemId,
        reason: result.reason
      });
      return {
        ok: false,
        status: 409,
        body: { reason: result.reason },
        rawBody: null
      };
    }

    logger.info?.('[agentic-trigger] Agentic run queued locally', { context, itemId });
    return {
      ok: true,
      status: 202,
      body: { agentic: result.agentic },
      rawBody: null
    };
  } catch (err) {
    logger.error?.('[agentic-trigger] Failed to start agentic run', {
      context,
      error: err instanceof Error ? err.message : err
    });
    return {
      ok: false,
      status: 500,
      body: { error: 'agentic-start-failed' },
      rawBody: null
    };
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
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
          upsertAgenticRun: ctx.upsertAgenticRun,
          updateAgenticRunStatus: ctx.updateAgenticRunStatus,
          logEvent: ctx.logEvent,
          logger: console,
          now: () => new Date()
        }
      });

      if (result.ok) {
        const agenticPayload = (result.body as { agentic?: unknown }) ?? {};
        return sendJson(res, result.status || 202, {
          ok: true,
          agentic: agenticPayload.agentic ?? null
        });
      }

      return sendJson(res, result.status || 422, {
        error: 'Agentic trigger failed',
        details: result.body ?? result.rawBody
      });
    } catch (err) {
      if (err instanceof AgenticTriggerValidationError) {
        console.warn('[agentic-trigger] Validation error', { reason: err.reason });
        return sendJson(res, 400, { error: err.message, reason: err.reason });
      }
      console.error('[agentic-trigger] Unexpected error while triggering agentic run', err);
      return sendJson(res, 500, { error: 'Failed to trigger agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic trigger proxy API</p></div>'
};

export default action;
