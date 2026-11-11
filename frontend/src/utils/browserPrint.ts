import type { PrintLabelBrowserTarget } from '../../../models';
import {
  IPP_OPERATION,
  decodeIppResponse,
  describePrinterState,
  encodeIppRequest,
  isIppSuccess
} from './ipp';
import { logError, logger } from './logger';

export interface BrowserPrintOptions {
  pdfUrl: string;
  printer: PrintLabelBrowserTarget;
  actor: string;
  jobName?: string;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

export interface BrowserPrintResult {
  sent: boolean;
  reason?: string;
  jobId?: number;
}

// Chrome's Local Network Access exempts an https page → http://<LAN host> request from mixed-content
// blocking only when the request declares it targets the local network (user grants a one-time prompt).
type LocalNetworkRequestInit = RequestInit & { targetAddressSpace?: 'local' | 'loopback' };

export function buildQueueEndpoint(printer: PrintLabelBrowserTarget): string {
  return `${printer.url.replace(/\/+$/, '')}/printers/${encodeURIComponent(printer.queue)}`;
}

// The proxy rewrites Host to localhost for CUPS, so the URI only needs the right resource path.
function buildPrinterUri(queue: string): string {
  return `ipp://localhost/printers/${encodeURIComponent(queue)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postIpp(
  endpoint: string,
  body: Uint8Array,
  fetchImpl: typeof fetch,
  authorization?: string
): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; reason: string; transient: boolean }> {
  let response: Response;
  try {
    const init: LocalNetworkRequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ipp',
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: body as BodyInit,
      targetAddressSpace: 'local'
    };
    response = await fetchImpl(endpoint, init);
  } catch (err) {
    // Network error, CORS rejection, mixed-content block and a denied LNA prompt all surface as the
    // same TypeError — the browser deliberately hides which one it was.
    logError('Browser IPP request failed before a response', err, { endpoint });
    return { ok: false, reason: 'printer_unreachable', transient: true };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'printer_auth_failed', transient: false };
  }
  if (!response.ok) {
    return { ok: false, reason: `printer_http_${response.status}`, transient: response.status >= 500 };
  }
  return { ok: true, data: await response.arrayBuffer() };
}

/** Fetches the rendered PDF from the backend and sends it as an IPP Print-Job to the LAN print proxy. */
export async function dispatchBrowserPrint({
  pdfUrl,
  printer,
  actor,
  jobName,
  fetchImpl = fetch,
  retryDelayMs = 800
}: BrowserPrintOptions): Promise<BrowserPrintResult> {
  if (!printer?.url || !printer?.queue) {
    return { sent: false, reason: 'printer_browser_target_missing' };
  }

  let document: Uint8Array;
  try {
    const pdfResponse = await fetchImpl(pdfUrl);
    if (!pdfResponse.ok) {
      logger.error?.('Rendered label PDF could not be fetched', { pdfUrl, status: pdfResponse.status });
      return { sent: false, reason: `pdf_http_${pdfResponse.status}` };
    }
    document = new Uint8Array(await pdfResponse.arrayBuffer());
  } catch (err) {
    logError('Failed to fetch rendered label PDF', err, { pdfUrl });
    return { sent: false, reason: 'pdf_fetch_failed' };
  }

  const endpoint = buildQueueEndpoint(printer);
  const body = encodeIppRequest({
    operation: IPP_OPERATION.PRINT_JOB,
    printerUri: buildPrinterUri(printer.queue),
    requestingUserName: actor,
    jobName,
    documentFormat: 'application/pdf',
    document
  });

  // Two attempts: the backend retries transient lp failures too; one retry covers a sleeping proxy.
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await postIpp(endpoint, body, fetchImpl, printer.authorization);
    if (!result.ok) {
      if (result.transient && attempt < maxAttempts) {
        logger.warn?.('Browser print attempt failed; retrying', { endpoint, attempt, reason: result.reason });
        await wait(retryDelayMs);
        continue;
      }
      return { sent: false, reason: result.reason };
    }

    try {
      const ipp = decodeIppResponse(result.data);
      if (!isIppSuccess(ipp.statusCode)) {
        const message = typeof ipp.attributes['status-message'] === 'string' ? ipp.attributes['status-message'] : '';
        logger.error?.('CUPS rejected browser print job', { endpoint, status: ipp.statusName, message });
        return { sent: false, reason: message ? `${ipp.statusName}: ${message}` : ipp.statusName };
      }
      const jobId = typeof ipp.attributes['job-id'] === 'number' ? ipp.attributes['job-id'] : undefined;
      logger.info?.('Browser print job accepted by CUPS', { endpoint, jobId });
      return { sent: true, jobId };
    } catch (err) {
      logError('Failed to decode IPP response from print proxy', err, { endpoint });
      return { sent: false, reason: 'ipp_response_invalid' };
    }
  }
  return { sent: false, reason: 'printer_unreachable' };
}

/** Get-Printer-Attributes probe for the browser-mode status check. */
export async function probeBrowserPrinter(
  printer: PrintLabelBrowserTarget,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; state: ReturnType<typeof describePrinterState>; reason?: string }> {
  const body = encodeIppRequest({
    operation: IPP_OPERATION.GET_PRINTER_ATTRIBUTES,
    printerUri: buildPrinterUri(printer.queue),
    requestedAttributes: ['printer-state', 'printer-is-accepting-jobs']
  });
  const result = await postIpp(buildQueueEndpoint(printer), body, fetchImpl, printer.authorization);
  if (!result.ok) return { ok: false, state: 'unknown', reason: result.reason };
  try {
    const ipp = decodeIppResponse(result.data);
    if (!isIppSuccess(ipp.statusCode)) return { ok: false, state: 'unknown', reason: ipp.statusName };
    const state = describePrinterState(ipp.attributes['printer-state']);
    const accepting = ipp.attributes['printer-is-accepting-jobs'] !== false;
    return {
      ok: state !== 'stopped' && accepting,
      state,
      reason: state === 'stopped' || !accepting ? 'printer_not_ready' : undefined
    };
  } catch (err) {
    logError('Failed to decode IPP status response', err);
    return { ok: false, state: 'unknown', reason: 'ipp_response_invalid' };
  }
}
