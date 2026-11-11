import type {
  PrintBrowserResultBody,
  PrintLabelRequestBody,
  PrintLabelResponsePayload,
  PrintLabelType
} from '../../../models';
import { dispatchBrowserPrint } from './browserPrint';
import { logError, logger } from './logger';

async function reportBrowserPrintResult(fetchImpl: typeof fetch, body: PrintBrowserResultBody): Promise<void> {
  try {
    await fetchImpl('/api/print/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    logError('Failed to report browser print result', err, { labelType: body.labelType, entityId: body.entityId });
  }
}

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
  labelTypeOverride?: PrintLabelType;
  fetchImpl?: typeof fetch;
}

function resolveLabelMetadata(
  boxId?: string,
  itemId?: string,
  labelTypeOverride?: PrintLabelType
): { labelType: PrintLabelType; entityId: string } | null {
  if (labelTypeOverride) {
    if (labelTypeOverride === 'box' || labelTypeOverride === 'shelf') {
      return boxId ? { labelType: labelTypeOverride, entityId: boxId } : null;
    }
    return itemId ? { labelType: labelTypeOverride, entityId: itemId } : null;
  }

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
  labelTypeOverride,
  fetchImpl = fetch
}: PrintLabelRequestOptions): Promise<PrintLabelRequestResult> {
  const trimmedActor = actor.trim();
  const labelMetadata = resolveLabelMetadata(boxId, itemId, labelTypeOverride);

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

  // Browser mode: the backend rendered the PDF but can't reach CUPS, so this browser (inside the
  // printer's LAN) sends the job. Done here so every caller (button, auto-print) gets it for free.
  if (response.ok && data.dispatch === 'browser' && data.pdfUrl && data.printer) {
    const browserResult = await dispatchBrowserPrint({
      pdfUrl: data.pdfUrl,
      printer: data.printer,
      actor: trimmedActor,
      jobName: data.jobName,
      fetchImpl
    });
    data = { ...data, sent: browserResult.sent, reason: browserResult.reason };
    void reportBrowserPrintResult(fetchImpl, {
      actor: trimmedActor,
      labelType,
      entityId,
      sent: browserResult.sent,
      reason: browserResult.reason,
      queue: data.printer?.queue
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
