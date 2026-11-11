jest.mock('../logger', () => ({
  logError: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { buildQueueEndpoint, dispatchBrowserPrint } from '../browserPrint';
import { requestPrintLabel } from '../printLabelRequest';

function ippResponse(status: number): ArrayBuffer {
  return Uint8Array.from([1, 1, status >> 8, status & 0xff, 0, 0, 0, 1, 0x03]).buffer;
}

function binaryResponse(body: ArrayBuffer, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => body } as unknown as Response;
}

const printer = { url: 'http://192.168.1.20:8631/', queue: 'QL800 box' };

describe('dispatchBrowserPrint', () => {
  it('fetches the PDF and posts an IPP job to the proxy with the local-network hint', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(binaryResponse(Uint8Array.from([0x25, 0x50]).buffer))
      .mockResolvedValueOnce(binaryResponse(ippResponse(0x0000)));

    const result = await dispatchBrowserPrint({
      pdfUrl: '/prints/box-1.pdf',
      printer,
      actor: 'tester',
      jobName: 'Box 1',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.sent).toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/prints/box-1.pdf');
    const [endpoint, init] = fetchImpl.mock.calls[1];
    expect(endpoint).toBe('http://192.168.1.20:8631/printers/QL800%20box');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/ipp' },
      targetAddressSpace: 'local'
    });
  });

  it('retries once when the proxy is unreachable, then reports it', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(binaryResponse(new ArrayBuffer(2)))
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await dispatchBrowserPrint({
      pdfUrl: '/prints/x.pdf',
      printer,
      actor: 'tester',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0
    });

    expect(result).toEqual({ sent: false, reason: 'printer_unreachable' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('surfaces CUPS rejections by IPP status name', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(binaryResponse(new ArrayBuffer(2)))
      .mockResolvedValueOnce(binaryResponse(ippResponse(0x0406)));

    const result = await dispatchBrowserPrint({
      pdfUrl: '/prints/x.pdf',
      printer,
      actor: 'tester',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result).toEqual({ sent: false, reason: 'client-error-not-found' });
  });

  it('sends the proxy basic-auth header and reports rejected credentials', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(binaryResponse(new ArrayBuffer(2)))
      .mockResolvedValueOnce(binaryResponse(new ArrayBuffer(0), 401));

    const result = await dispatchBrowserPrint({
      pdfUrl: '/prints/x.pdf',
      printer: { ...printer, authorization: 'Basic dTpw' },
      actor: 'tester',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result).toEqual({ sent: false, reason: 'printer_auth_failed' });
    expect(fetchImpl.mock.calls[1][1].headers).toEqual({
      'Content-Type': 'application/ipp',
      Authorization: 'Basic dTpw'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // auth failures are not retried
  });

  it('builds the queue endpoint without double slashes', () => {
    expect(buildQueueEndpoint({ url: 'http://h:8631//', queue: 'q' })).toBe('http://h:8631/printers/q');
  });
});

describe('requestPrintLabel in browser mode', () => {
  it('dispatches from the browser and reports the outcome to the backend', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.startsWith('/api/print/box/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sent: false,
            dispatch: 'browser',
            previewUrl: '/prints/box-B1.html',
            pdfUrl: '/prints/box-B1.pdf',
            jobName: 'Box B1',
            printer: { url: 'http://192.168.1.20:8631', queue: 'QL800_box' }
          })
        } as unknown as Response;
      }
      if (url === '/prints/box-B1.pdf') return binaryResponse(new ArrayBuffer(4));
      if (url.startsWith('http://192.168.1.20:8631/')) return binaryResponse(ippResponse(0x0000));
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    });

    const result = await requestPrintLabel({
      boxId: 'B1',
      actor: 'tester',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.ok).toBe(true);
    expect(result.data.sent).toBe(true);
    const reportCall = fetchImpl.mock.calls.find(([url]) => url === '/api/print/result') as unknown as [string, RequestInit];
    expect(reportCall).toBeDefined();
    expect(JSON.parse(String(reportCall[1].body))).toMatchObject({
      labelType: 'box',
      entityId: 'B1',
      sent: true,
      queue: 'QL800_box'
    });
  });
});
