import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import type { Action } from './index';
import { AGENTIC_API_BASE } from '../config';

export class AgenticHealthRequestError extends Error {
  public readonly reason: 'network-error';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AgenticHealthRequestError';
    this.reason = 'network-error';
    if (options?.cause !== undefined) {
      // @ts-expect-error Node 16 compat
      this.cause = options.cause;
    }
  }
}

interface AgenticHealthForwardOptions {
  agenticApiBase?: string | null;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

interface AgenticHealthForwardResult {
  ok: boolean;
  status: number;
  body: unknown;
  rawBody: string | null;
  contentType: string | null;
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

async function forwardAgenticHealth(
  options: AgenticHealthForwardOptions = {}
): Promise<AgenticHealthForwardResult> {
  const { agenticApiBase, fetchImpl = fetch, logger = console } = options;

  const sanitizedBase = sanitizeAgenticApiBase(AGENTIC_API_BASE);
  if (!sanitizedBase) {
    throw new Error('Agentic API base URL is not configured');
  }

  let healthUrl: string;
  try {
    healthUrl = new URL('/health', sanitizedBase).toString();
  } catch (err) {
    logger.error?.('[agentic-health] Failed to construct health URL', err);
    throw err;
  }

  let response: Response;
  try {
    response = await fetchImpl(healthUrl, { method: 'GET' });
  } catch (err) {
    logger.error?.('[agentic-health] Network error while forwarding health check', err, { url: healthUrl });
    throw new AgenticHealthRequestError('Failed to reach agentic service', { cause: err});
  }

  const contentType = response.headers.get('content-type');

  let rawBody: string | null = null;
  let parsedBody: unknown = null;
  try {
    rawBody = await response.text();
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (parseErr) {
        logger.warn?.('[agentic-health] Failed to parse health response as JSON', parseErr);
        parsedBody = null;
      }
    }
  } catch (err) {
    logger.warn?.('[agentic-health] Failed to read health response body', err);
  }

  if (response.ok) {
    logger.info?.('[agentic-health] Agentic health check succeeded', { status: response.status });
  } else {
    logger.error?.('[agentic-health] Agentic service reported unhealthy status', {
      status: response.status,
      body: parsedBody ?? rawBody
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    rawBody,
    contentType: contentType ?? null
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendForwardedBody(
  res: ServerResponse,
  result: AgenticHealthForwardResult,
): void {
  if (result.body !== null && result.body !== undefined) {
    sendJson(res, result.status || 200, result.body);
    return;
  }

  const contentType = result.contentType ?? 'application/json';
  res.writeHead(result.status || 200, { 'Content-Type': contentType });
  res.end(result.rawBody ?? '');
}

const action: Action = {
  key: 'agentic-health',
  label: 'Agentic health proxy',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/agentic/health' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!ctx?.agenticServiceEnabled) {
      console.info('[agentic-health] Agentic service disabled; skipping health proxy');
      sendJson(res, 503, { ok: false, error: 'Agentic service disabled' });
      return;
    }

    try {
      const result = await forwardAgenticHealth({
        agenticApiBase: AGENTIC_API_BASE,
        logger: console
      });

      sendForwardedBody(res, result);
    } catch (err) {
      if (err instanceof AgenticHealthRequestError) {
        console.error('[agentic-health] Failed to reach agentic service health endpoint', err);
        sendJson(res, 502, { ok: false, error: err.message, reason: err.reason });
        return;
      }

      console.error('[agentic-health] Unexpected error while proxying health check', err);
      sendJson(res, 500, { ok: false, error: 'Failed to fetch agentic health status' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agentic health proxy API</p></div>'
};

export default action;

export { forwardAgenticHealth };
