import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import type { Action } from './index';
import { AGENTIC_API_BASE } from '../config';

export interface AgenticRunTriggerPayload {
  itemId?: string | null;
  artikelbeschreibung?: string | null;
  id?: string | null;
  search?: string | null;
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

export class AgenticTriggerRequestError extends Error {
  public readonly reason: 'network-error';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AgenticTriggerRequestError';
    this.reason = 'network-error';
    if (options?.cause !== undefined) {
      // @ts-expect-error Node 16 compat
      this.cause = options.cause;
    }
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
  agenticApiBase?: string | null;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

function sanitizeAgenticApiBase(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, '');
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
  const { context = 'server', agenticApiBase, fetchImpl = fetch, logger = console } = options;

  const sanitizedBase = sanitizeAgenticApiBase(agenticApiBase ?? AGENTIC_API_BASE);
  if (!sanitizedBase) {
    throw new Error('Agentic API base URL is not configured');
  }

  const { requestBody } = buildAgenticRunRequestBody(payload);

  let runUrl: string;
  try {
    runUrl = new URL('/run', sanitizedBase).toString();
  } catch (err) {
    logger.error?.('[agentic-trigger] Failed to construct run URL', err);
    throw err;
  }

  let response: Response;
  try {
    response = await fetchImpl(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    logger.error?.('[agentic-trigger] Network error while forwarding trigger', { context });
    throw new AgenticTriggerRequestError('Failed to reach agentic service', { cause: err });
  }

  let rawBody: string | null = null;
  let parsedBody: unknown = null;
  try {
    rawBody = await response.text();
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (parseErr) {
        parsedBody = rawBody;
      }
    }
  } catch (err) {
    logger.warn?.('[agentic-trigger] Failed to read agentic response body', err);
  }

  if (!response.ok) {
    logger.error?.('[agentic-trigger] Agentic service responded with error', {
      context,
      status: response.status,
      body: parsedBody ?? rawBody
    });
  } else {
    logger.info?.('[agentic-trigger] Agentic run forwarded successfully', {
      context,
      status: response.status
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    rawBody
  };
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
    if (!ctx.agenticServiceEnabled) {
      console.info('[agentic-trigger] Agentic service disabled; skipping trigger proxy');
      return sendJson(res, 503, { error: 'Agentic service disabled' });
    }

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
        agenticApiBase: AGENTIC_API_BASE,
        logger: console
      });

      if (result.ok) {
        return sendJson(res, result.status || 202, { ok: true });
      }

      return sendJson(res, result.status || 502, {
        error: 'Agentic trigger failed',
        details: result.body ?? result.rawBody
      });
    } catch (err) {
      if (err instanceof AgenticTriggerValidationError) {
        console.warn('[agentic-trigger] Validation error', { reason: err.reason });
        return sendJson(res, 400, { error: err.message, reason: err.reason });
      }
      if (err instanceof AgenticTriggerRequestError) {
        console.error('[agentic-trigger] Request error while forwarding trigger', err);
        return sendJson(res, 502, { error: err.message, reason: err.reason });
      }
      console.error('[agentic-trigger] Unexpected error while forwarding trigger', err);
      return sendJson(res, 500, { error: 'Failed to trigger agentic run' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic trigger proxy API</p></div>'
};

export default action;
