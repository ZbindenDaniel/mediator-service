import type { PrintLabelRequestBody, PrintLabelResponsePayload, PrintLabelType } from '../../../models';
import { logError, logger } from './logger';

export interface PrintLabelRequestResult {
  ok: boolean;
  status: number;
  data: PrintLabelResponsePayload;
  labelType: PrintLabelType | null;
  entityId: string | null;
}

export interface PrintLabelRequestOptions {
  boxId?: string;
  itemId?: string;
  actor: string;
  fetchImpl?: typeof fetch;
}

function resolveLabelMetadata(
  boxId?: string,
  itemId?: string
): { labelType: PrintLabelType; entityId: string } | null {
  const entityId = boxId || itemId || '';
  if (!entityId) {
    return null;
  }

  if (boxId) {
    return { labelType: boxId.startsWith('S-') ? 'shelf' : 'box', entityId };
  }

  return itemId ? { labelType: 'item', entityId } : null;
}

export async function requestPrintLabel({
  boxId,
  itemId,
  actor,
  fetchImpl = fetch
}: PrintLabelRequestOptions): Promise<PrintLabelRequestResult> {
  const trimmedActor = actor.trim();
  const labelMetadata = resolveLabelMetadata(boxId, itemId);

  if (!trimmedActor) {
    logError('Print request blocked: missing actor', undefined, { boxId, itemId });
    return {
      ok: false,
      status: 0,
      data: { error: 'actor required' },
      labelType: labelMetadata?.labelType ?? null,
      entityId: labelMetadata?.entityId ?? null
    };
  }

  if (!labelMetadata) {
    logError('Print request blocked: invalid label metadata', undefined, { boxId, itemId });
    return {
      ok: false,
      status: 0,
      data: { error: 'invalid label metadata' },
      labelType: null,
      entityId: null
    };
  }

  const { labelType, entityId } = labelMetadata;
  const url = `/api/print/${labelType}/${encodeURIComponent(entityId)}`;

  let response: Response;
  const payload: PrintLabelRequestBody = { actor: trimmedActor, labelType };
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    logError('Print request failed', err, { labelType, entityId });
    return {
      ok: false,
      status: 0,
      data: { error: 'request failed' },
      labelType,
      entityId
    };
  }

  let data: PrintLabelResponsePayload = {};
  try {
    data = await response.json();
  } catch (err) {
    logError('Failed to parse print response', err, { labelType, entityId });
  }

  if (!response.ok) {
    logger.warn?.('Print request responded with non-OK status', {
      labelType,
      entityId,
      status: response.status
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    labelType,
    entityId
  };
}
