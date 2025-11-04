import { callbackConfig } from '../config/index.js';
import { logger } from './logger.js';

function resolveCallbackSettings() {
  const baseUrl = callbackConfig.baseUrl ?? 'localhost:8080';
  const sharedSecret = callbackConfig.sharedSecret;

  if (!baseUrl) {
    logger.warn({ msg: 'AGENT_API_BASE_URL not set, skipping callback dispatch' });
    return null;
  }

  if (!sharedSecret) {
    logger.warn({ msg: 'AGENT_SHARED_SECRET not set, skipping callback dispatch' });
    return null;
  }

  return { baseUrl, sharedSecret };
}

function buildEndpointUrl(baseUrl, endpointPath, context = {}) {
  try {
    return new URL(endpointPath, baseUrl).toString();
  } catch (err) {
    logger.error({ err, baseUrl, endpointPath, ...context }, 'failed to construct callback url');
    throw err;
  }
}

function parseJsonSafely(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return null;
  }

  try {
    return JSON.parse(input);
  } catch (err) {
    logger.debug({ err, msg: 'failed to parse trigger failure response as json' });
    return input;
  }
}

export async function sendToExternal(payload) {
  const settings = resolveCallbackSettings();
  if (!settings) {
    return;
  }

  const itemId = payload?.itemId ?? payload?.item?.itemUUid ?? payload?.id;
  if (!itemId) {
    logger.warn({ msg: 'missing item identifier in payload, skipping callback dispatch' });
    return;
  }

  const endpointPath = `/api/agentic/items/${encodeURIComponent(itemId)}/result`;
  const endpointUrl = buildEndpointUrl(settings.baseUrl, endpointPath, { itemId });

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'user-agent': 'your-user-agent',
        'x-agent-secret': settings.sharedSecret,
      },
      body: JSON.stringify(payload ?? null),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => null);
      const rejectionError = new Error(
        `External API rejected the update with status ${res.status} ${res.statusText}. ${endpointUrl}`,
      );
      logger.error(
        {
          err: rejectionError,
          status: res.status,
          statusText: res.statusText,
          responseBody: body,
          endpoint: endpointUrl,
          payloadStatus: payload?.status,
          itemId,
        },
        'external api rejected update',
      );
      throw rejectionError;
    }
    logger.debug({ msg: 'external api response', status: res.status, endpoint: endpointUrl, itemId });
  } catch (err) {
    logger.error({ err, endpoint: endpointUrl, itemId }, 'external api request failed');
    throw err;
  }
}

export async function triggerAgenticFailure({
  itemId,
  actor,
  labels,
  searchTerm,
  statusCode,
  responseBody,
  errorMessage,
}) {
  if (!itemId) {
    logger.warn({ msg: 'missing item identifier for trigger failure notification' });
    return null;
  }

  const settings = resolveCallbackSettings();
  if (!settings) {
    return null;
  }

  const endpointPath = `/api/items/${encodeURIComponent(itemId)}/agentic/trigger-failure`;
  const endpointUrl = buildEndpointUrl(settings.baseUrl, endpointPath, { itemId });

  const normalizedActor =
    typeof actor === 'string' && actor.trim().length ? actor.trim() : 'item-flow-service';
  const normalizedLabels = Array.isArray(labels)
    ? Array.from(
        new Set(
          labels
            .filter((label) => typeof label === 'string' && label.trim().length)
            .map((label) => label.trim()),
        ),
      )
    : [];
  const normalizedSearchTerm =
    typeof searchTerm === 'string' && searchTerm.trim().length ? searchTerm.trim() : null;
  const normalizedStatusCode = Number.isFinite(statusCode) ? Number(statusCode) : null;
  const normalizedErrorMessage =
    typeof errorMessage === 'string' && errorMessage.trim().length ? errorMessage : null;

  const requestPayload = {
    actor: normalizedActor,
    labels: normalizedLabels,
    searchTerm: normalizedSearchTerm,
    statusCode: normalizedStatusCode,
    responseBody: responseBody ?? null,
    errorMessage: normalizedErrorMessage,
  };

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': settings.sharedSecret,
      },
      body: JSON.stringify(requestPayload),
    });

    const responseText = await res.text().catch(() => null);
    const parsedResponse = parseJsonSafely(responseText);

    if (!res.ok) {
      const rejectionError = new Error(
        `External API rejected trigger failure with status ${res.status} ${res.statusText}`,
      );
      logger.error(
        {
          err: rejectionError,
          status: res.status,
          statusText: res.statusText,
          responseBody: responseText,
          endpoint: endpointUrl,
          itemId,
          labels: normalizedLabels,
        },
        'external api rejected trigger failure',
      );
      throw rejectionError;
    }

    logger.info({
      msg: 'external trigger failure dispatched',
      status: res.status,
      endpoint: endpointUrl,
      itemId,
      labels: normalizedLabels,
    });

    return parsedResponse;
  } catch (err) {
    logger.error({ err, endpoint: endpointUrl, itemId }, 'external trigger failure request failed');
    throw err;
  }
}
