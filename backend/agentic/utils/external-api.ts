import { callbackConfig, agentActorId } from '../config';

export interface ExternalApiLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface ExternalApiOptions {
  logger?: ExternalApiLogger;
  fetchImpl?: typeof fetch;
}

export interface AgenticResultPayload {
  itemId: string;
  status: string;
  error: string | null;
  needsReview: boolean;
  summary: string;
  reviewDecision: string | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  actor: string;
  item: Record<string, unknown> & { itemUUid: string };
}

export interface TriggerFailureOptions extends ExternalApiOptions {
  itemId: string;
  actor?: string | null;
  labels?: string[] | null;
  searchTerm?: string | null;
  statusCode?: number | null;
  responseBody?: unknown;
  errorMessage?: string | null;
}

function resolveCallbackSettings(logger: ExternalApiLogger | undefined): { baseUrl: string; sharedSecret: string } | null {
  const baseUrl = callbackConfig.baseUrl ?? '';
  const sharedSecret = callbackConfig.sharedSecret ?? '';

  if (!baseUrl) {
    logger?.warn?.({ msg: 'AGENT_API_BASE_URL not set, skipping callback dispatch' });
    return null;
  }

  if (!sharedSecret) {
    logger?.warn?.({ msg: 'AGENT_SHARED_SECRET not set, skipping callback dispatch' });
    return null;
  }

  return { baseUrl, sharedSecret };
}

function buildEndpointUrl(baseUrl: string, endpointPath: string, logger: ExternalApiLogger | undefined, context: Record<string, unknown>): string {
  try {
    return new URL(endpointPath, baseUrl).toString();
  } catch (err) {
    logger?.error?.({ err, baseUrl, endpointPath, ...context, msg: 'failed to construct callback url' });
    throw err;
  }
}

async function readResponseBody(res: Response): Promise<string | null> {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function parseJsonSafely(input: string | null, logger: ExternalApiLogger | undefined): unknown {
  if (typeof input !== 'string' || !input.trim()) {
    return null;
  }

  try {
    return JSON.parse(input);
  } catch (err) {
    logger?.debug?.({ err, msg: 'failed to parse trigger failure response as json' });
    return input;
  }
}

export async function sendToExternal(payload: AgenticResultPayload, options: ExternalApiOptions = {}): Promise<void> {
  const logger = options.logger ?? console;
  const settings = resolveCallbackSettings(logger);
  if (!settings) {
    return;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const itemId = payload?.itemId ?? payload?.item?.itemUUid ?? null;
  if (!itemId) {
    logger.warn?.({ msg: 'missing item identifier in payload, skipping callback dispatch' });
    return;
  }

  const endpointPath = `/api/agentic/items/${encodeURIComponent(itemId)}/result`;
  const endpointUrl = buildEndpointUrl(settings.baseUrl, endpointPath, logger, { itemId });

  try {
    const res = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': settings.sharedSecret
      },
      body: JSON.stringify(payload ?? null)
    });

    if (!res.ok) {
      const body = await readResponseBody(res);
      const rejectionError = new Error(`External API rejected the update with status ${res.status} ${res.statusText}. ${endpointUrl}`);
      logger.error?.({
        err: rejectionError,
        status: res.status,
        statusText: res.statusText,
        responseBody: body,
        endpoint: endpointUrl,
        payloadStatus: payload?.status,
        itemId
      });
      throw rejectionError;
    }

    logger.debug?.({ msg: 'external api response', status: res.status, endpoint: endpointUrl, itemId });
  } catch (err) {
    logger.error?.({ err, endpoint: endpointUrl, itemId, msg: 'external api request failed' });
    throw err;
  }
}

export async function triggerAgenticFailure(options: TriggerFailureOptions): Promise<unknown> {
  const logger = options.logger ?? console;
  const { itemId } = options;
  if (!itemId) {
    logger.warn?.({ msg: 'missing item identifier for trigger failure notification' });
    return null;
  }

  const settings = resolveCallbackSettings(logger);
  if (!settings) {
    return null;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpointPath = `/api/items/${encodeURIComponent(itemId)}/agentic/trigger-failure`;
  const endpointUrl = buildEndpointUrl(settings.baseUrl, endpointPath, logger, { itemId });

  const normalizedActor = typeof options.actor === 'string' && options.actor.trim() ? options.actor.trim() : agentActorId;
  const normalizedLabels = Array.isArray(options.labels)
    ? Array.from(new Set(options.labels.filter((label) => typeof label === 'string' && label.trim()).map((label) => label.trim())))
    : [];
  const normalizedSearchTerm = typeof options.searchTerm === 'string' && options.searchTerm.trim() ? options.searchTerm.trim() : null;
  const normalizedStatusCode = Number.isFinite(options.statusCode ?? NaN) ? Number(options.statusCode) : null;
  const normalizedErrorMessage = typeof options.errorMessage === 'string' && options.errorMessage.trim() ? options.errorMessage : null;

  const requestPayload = {
    actor: normalizedActor,
    labels: normalizedLabels,
    searchTerm: normalizedSearchTerm,
    statusCode: normalizedStatusCode,
    responseBody: options.responseBody ?? null,
    errorMessage: normalizedErrorMessage
  };

  try {
    const res = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': settings.sharedSecret
      },
      body: JSON.stringify(requestPayload)
    });

    const responseText = await readResponseBody(res);
    const parsedResponse = parseJsonSafely(responseText, logger);

    if (!res.ok) {
      const rejectionError = new Error(`External API rejected trigger failure with status ${res.status} ${res.statusText}`);
      logger.error?.({
        err: rejectionError,
        status: res.status,
        statusText: res.statusText,
        responseBody: responseText,
        endpoint: endpointUrl,
        itemId,
        labels: normalizedLabels
      });
      throw rejectionError;
    }

    logger.info?.({
      msg: 'external trigger failure dispatched',
      status: res.status,
      endpoint: endpointUrl,
      itemId,
      labels: normalizedLabels
    });

    return parsedResponse;
  } catch (err) {
    logger.error?.({ err, endpoint: endpointUrl, itemId, msg: 'external trigger failure request failed' });
    throw err;
  }
}
