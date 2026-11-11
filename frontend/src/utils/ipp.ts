// Minimal IPP/1.1 encoder/decoder (RFC 8010/8011) — just enough for Print-Job and
// Get-Printer-Attributes against CUPS. Hand-rolled instead of a library because the npm IPP
// clients depend on Node's http/Buffer and don't run in the browser.

export const IPP_OPERATION = {
  PRINT_JOB: 0x0002,
  GET_PRINTER_ATTRIBUTES: 0x000b
} as const;

const TAG = {
  OPERATION_ATTRIBUTES: 0x01,
  JOB_ATTRIBUTES: 0x02,
  END_OF_ATTRIBUTES: 0x03,
  PRINTER_ATTRIBUTES: 0x04,
  UNSUPPORTED_ATTRIBUTES: 0x05,
  INTEGER: 0x21,
  BOOLEAN: 0x22,
  ENUM: 0x23,
  TEXT_WITHOUT_LANGUAGE: 0x41,
  NAME_WITHOUT_LANGUAGE: 0x42,
  KEYWORD: 0x44,
  URI: 0x45,
  CHARSET: 0x47,
  NATURAL_LANGUAGE: 0x48,
  MIME_MEDIA_TYPE: 0x49
} as const;

const STATUS_NAMES: Record<number, string> = {
  0x0000: 'successful-ok',
  0x0001: 'successful-ok-ignored-or-substituted-attributes',
  0x0002: 'successful-ok-conflicting-attributes',
  0x0400: 'client-error-bad-request',
  0x0401: 'client-error-forbidden',
  0x0402: 'client-error-not-authenticated',
  0x0403: 'client-error-not-authorized',
  0x0404: 'client-error-not-possible',
  0x0405: 'client-error-timeout',
  0x0406: 'client-error-not-found',
  0x040a: 'client-error-document-format-not-supported',
  0x0500: 'server-error-internal-error',
  0x0501: 'server-error-operation-not-supported',
  0x0503: 'server-error-version-not-supported',
  0x0504: 'server-error-device-error',
  0x0506: 'server-error-not-accepting-jobs',
  0x0507: 'server-error-busy'
};

export type IppValue = string | number | boolean;

export interface IppResponse {
  version: string;
  statusCode: number;
  statusName: string;
  requestId: number;
  /** Flattened attributes from all groups; repeated names collect into arrays. */
  attributes: Record<string, IppValue | IppValue[]>;
}

export interface IppRequestOptions {
  operation: number;
  printerUri: string;
  requestId?: number;
  requestingUserName?: string;
  jobName?: string;
  documentFormat?: string;
  requestedAttributes?: string[];
  document?: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class ByteWriter {
  private chunks: number[] = [];

  u8(value: number): void {
    this.chunks.push(value & 0xff);
  }

  u16(value: number): void {
    this.u8(value >> 8);
    this.u8(value);
  }

  u32(value: number): void {
    this.u16(value >>> 16);
    this.u16(value);
  }

  bytes(value: Uint8Array): void {
    for (const b of value) this.chunks.push(b);
  }

  attribute(tag: number, name: string, value: string): void {
    const nameBytes = encoder.encode(name);
    const valueBytes = encoder.encode(value);
    this.u8(tag);
    this.u16(nameBytes.length);
    this.bytes(nameBytes);
    this.u16(valueBytes.length);
    this.bytes(valueBytes);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export function ippStatusName(code: number): string {
  return STATUS_NAMES[code] ?? `status-0x${code.toString(16).padStart(4, '0')}`;
}

export function isIppSuccess(code: number): boolean {
  return code >= 0x0000 && code <= 0x00ff;
}

export function encodeIppRequest(options: IppRequestOptions): Uint8Array {
  const writer = new ByteWriter();
  writer.u8(1); // version 1.1: every CUPS release accepts it
  writer.u8(1);
  writer.u16(options.operation);
  writer.u32(options.requestId ?? 1);

  writer.u8(TAG.OPERATION_ATTRIBUTES);
  // RFC 8011 requires charset, natural-language and the target URI first, in this order.
  writer.attribute(TAG.CHARSET, 'attributes-charset', 'utf-8');
  writer.attribute(TAG.NATURAL_LANGUAGE, 'attributes-natural-language', 'en');
  writer.attribute(TAG.URI, 'printer-uri', options.printerUri);
  if (options.requestingUserName) {
    writer.attribute(TAG.NAME_WITHOUT_LANGUAGE, 'requesting-user-name', options.requestingUserName);
  }
  if (options.jobName) {
    writer.attribute(TAG.NAME_WITHOUT_LANGUAGE, 'job-name', options.jobName);
  }
  if (options.documentFormat) {
    writer.attribute(TAG.MIME_MEDIA_TYPE, 'document-format', options.documentFormat);
  }
  if (options.requestedAttributes?.length) {
    options.requestedAttributes.forEach((name, index) => {
      // Additional values of a multi-valued attribute carry an empty name.
      writer.attribute(TAG.KEYWORD, index === 0 ? 'requested-attributes' : '', name);
    });
  }
  writer.u8(TAG.END_OF_ATTRIBUTES);

  const header = writer.toUint8Array();
  if (!options.document) return header;
  const out = new Uint8Array(header.length + options.document.length);
  out.set(header, 0);
  out.set(options.document, header.length);
  return out;
}

export function decodeIppResponse(input: ArrayBuffer | Uint8Array): IppResponse {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8) {
    throw new Error('ipp_response_too_short');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const statusCode = view.getUint16(2);
  const response: IppResponse = {
    version: `${bytes[0]}.${bytes[1]}`,
    statusCode,
    statusName: ippStatusName(statusCode),
    requestId: view.getUint32(4),
    attributes: {}
  };

  let offset = 8;
  let lastName = '';
  while (offset < bytes.length) {
    const tag = bytes[offset];
    offset += 1;
    if (tag === TAG.END_OF_ATTRIBUTES) break;
    if (tag <= 0x0f) continue; // delimiter tag: start of a new attribute group

    if (offset + 2 > bytes.length) throw new Error('ipp_response_truncated');
    const nameLength = view.getUint16(offset);
    offset += 2;
    const name = decoder.decode(bytes.subarray(offset, offset + nameLength));
    offset += nameLength;
    if (offset + 2 > bytes.length) throw new Error('ipp_response_truncated');
    const valueLength = view.getUint16(offset);
    offset += 2;
    if (offset + valueLength > bytes.length) throw new Error('ipp_response_truncated');
    const raw = bytes.subarray(offset, offset + valueLength);
    offset += valueLength;

    let value: IppValue;
    if ((tag === TAG.INTEGER || tag === TAG.ENUM) && valueLength === 4) {
      value = view.getInt32(offset - 4);
    } else if (tag === TAG.BOOLEAN && valueLength === 1) {
      value = raw[0] !== 0;
    } else if (tag >= 0x40 && tag <= 0x5f) {
      value = decoder.decode(raw);
    } else {
      continue; // dates, ranges, resolutions etc. are not needed here
    }

    const key = name || lastName;
    if (name) lastName = name;
    const existing = response.attributes[key];
    if (existing === undefined) {
      response.attributes[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      response.attributes[key] = [existing, value];
    }
  }

  return response;
}

/** IPP `printer-state` enum (RFC 8011 §5.4.11). */
export function describePrinterState(state: IppValue | IppValue[] | undefined): 'idle' | 'processing' | 'stopped' | 'unknown' {
  const value = Array.isArray(state) ? state[0] : state;
  if (value === 3) return 'idle';
  if (value === 4) return 'processing';
  if (value === 5) return 'stopped';
  return 'unknown';
}
