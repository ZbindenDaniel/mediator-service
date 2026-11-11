import {
  IPP_OPERATION,
  decodeIppResponse,
  describePrinterState,
  encodeIppRequest,
  isIppSuccess
} from '../ipp';

// Builds a fake CUPS response: header + operation group + optional job group with job-id.
function buildResponse(status: number, jobId?: number, message?: string): Uint8Array {
  const bytes: number[] = [1, 1, status >> 8, status & 0xff, 0, 0, 0, 1, 0x01];
  const attr = (tag: number, name: string, value: number[]) => {
    const n = Array.from(new TextEncoder().encode(name));
    bytes.push(tag, n.length >> 8, n.length & 0xff, ...n, value.length >> 8, value.length & 0xff, ...value);
  };
  attr(0x47, 'attributes-charset', Array.from(new TextEncoder().encode('utf-8')));
  if (message) attr(0x41, 'status-message', Array.from(new TextEncoder().encode(message)));
  if (jobId !== undefined) {
    bytes.push(0x02);
    attr(0x21, 'job-id', [(jobId >>> 24) & 0xff, (jobId >>> 16) & 0xff, (jobId >>> 8) & 0xff, jobId & 0xff]);
  }
  bytes.push(0x03);
  return Uint8Array.from(bytes);
}

describe('encodeIppRequest', () => {
  it('writes an IPP/1.1 Print-Job header with required attributes first and the document last', () => {
    const doc = Uint8Array.from([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const out = encodeIppRequest({
      operation: IPP_OPERATION.PRINT_JOB,
      printerUri: 'ipp://localhost/printers/QL800_box',
      requestId: 7,
      requestingUserName: 'tester',
      documentFormat: 'application/pdf',
      document: doc
    });

    expect(Array.from(out.subarray(0, 8))).toEqual([1, 1, 0x00, 0x02, 0, 0, 0, 7]);
    expect(out[8]).toBe(0x01);
    const text = new TextDecoder().decode(out);
    expect(text.indexOf('attributes-charset')).toBeLessThan(text.indexOf('attributes-natural-language'));
    expect(text.indexOf('attributes-natural-language')).toBeLessThan(text.indexOf('printer-uri'));
    expect(text).toContain('ipp://localhost/printers/QL800_box');
    expect(text).toContain('application/pdf');
    expect(Array.from(out.subarray(out.length - 5))).toEqual([0x03, 0x25, 0x50, 0x44, 0x46]);
  });

  it('encodes additional requested-attributes values with an empty name', () => {
    const out = encodeIppRequest({
      operation: IPP_OPERATION.GET_PRINTER_ATTRIBUTES,
      printerUri: 'ipp://localhost/printers/q',
      requestedAttributes: ['printer-state', 'printer-is-accepting-jobs']
    });
    const decoded = decodeIppResponse(out); // request and response share the attribute encoding
    expect(decoded.attributes['requested-attributes']).toEqual(['printer-state', 'printer-is-accepting-jobs']);
  });
});

describe('decodeIppResponse', () => {
  it('reads status and job-id from a successful response', () => {
    const decoded = decodeIppResponse(buildResponse(0x0000, 42));
    expect(decoded.statusCode).toBe(0);
    expect(decoded.statusName).toBe('successful-ok');
    expect(isIppSuccess(decoded.statusCode)).toBe(true);
    expect(decoded.attributes['job-id']).toBe(42);
  });

  it('names error statuses and keeps the status message', () => {
    const decoded = decodeIppResponse(buildResponse(0x0406, undefined, 'The printer or class does not exist.'));
    expect(isIppSuccess(decoded.statusCode)).toBe(false);
    expect(decoded.statusName).toBe('client-error-not-found');
    expect(decoded.attributes['status-message']).toBe('The printer or class does not exist.');
  });

  it('rejects truncated input', () => {
    expect(() => decodeIppResponse(Uint8Array.from([1, 1, 0]))).toThrow('ipp_response_too_short');
    const truncated = buildResponse(0, 1).subarray(0, 15);
    expect(() => decodeIppResponse(truncated)).toThrow('ipp_response_truncated');
  });
});

describe('describePrinterState', () => {
  it('maps the printer-state enum', () => {
    expect(describePrinterState(3)).toBe('idle');
    expect(describePrinterState(4)).toBe('processing');
    expect(describePrinterState(5)).toBe('stopped');
    expect(describePrinterState(undefined)).toBe('unknown');
  });
});
