import type { IncomingMessage, ServerResponse } from 'http';

const logEvent = jest.fn(async () => undefined);
const persistItemInstance = jest.fn(async () => undefined);
const execute = jest.fn(async () => undefined);

// The existing instance the operator matched onto. Mutated per-test to exercise the guards.
let existingItem: { Artikel_Nummer: string | null; SerialNumber: string | null; MacAddress: string | null } | null = {
  Artikel_Nummer: '100', SerialNumber: null, MacAddress: null,
};

jest.mock('../../db', () => ({
  persistItemReference: jest.fn(async () => undefined),
  persistItemInstance: (...args: unknown[]) => persistItemInstance(...args),
  insertQualityAssessment: jest.fn(async () => 1),
  updateItemQualityAssessment: jest.fn(async () => undefined),
  updateItemInstanceSpecs: jest.fn(async () => undefined),
  getMaxArtikelNummer: jest.fn(async () => '100'),
  getMaxItemId: jest.fn(async () => null),
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

jest.mock('../../db-client', () => ({
  queryOne: jest.fn(async (sql: string) => {
    if (/FROM item_refs/.test(sql)) {
      return { Artikel_Nummer: '100', Hersteller: 'HP', Kurzbeschreibung: 'Laptop', Unterkategorien_A: '201' };
    }
    // attachIntakeToExistingInstance looks up the item by its ItemUUID.
    if (/FROM items WHERE "ItemUUID"/.test(sql)) return existingItem;
    return null;
  }),
  execute: (...args: unknown[]) => execute(...args),
}));

jest.mock('../../lib/itemIds', () => ({ generateItemUUID: jest.fn(async () => 'I-100-0099') }));
jest.mock('../../utils/intake-auth', () => ({ requireIntakeAuth: jest.fn(() => true) }));
jest.mock('../../lib/in-device-components', () => ({ syncInDeviceComponents: jest.fn(async () => undefined) }));
jest.mock('../../lib/quality-contracts', () => ({
  loadGeneralContract: jest.fn(() => ({ questions: [] })),
  loadSubCategoryContract: jest.fn(() => ({ questions: [] })),
  assemblyToQualityContract: jest.fn(() => ({ questions: [] })),
  buildQualityCheckResponse: jest.fn(() => ({ qualityTag: 'good', qualityValue: 4, derivedSpecs: {}, answers: {} })),
}));
jest.mock('../../contracts/registry', () => ({ getAssemblyContract: jest.fn(() => null) }));
jest.mock('../../lib/intake-quality-map', () => ({
  resolveIntakeQuestions: jest.fn(() => ({ ask: [], autoAnswers: {}, detected: [], unresolvedAutoFill: [] })),
  deriveInstanceSpecsFromScan: jest.fn(() => ({})),
  normalizeScanComponents: jest.fn(() => []),
}));

import action from '../intake-answer';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, body?: unknown): IncomingMessage {
  const payload = body !== undefined ? JSON.stringify(body) : '';
  const req: any = { url, method: 'POST', headers: {} };
  req[Symbol.asyncIterator] = async function* () { if (payload) yield payload; };
  return req as IncomingMessage;
}

beforeEach(() => {
  jest.clearAllMocks();
  existingItem = { Artikel_Nummer: '100', SerialNumber: null, MacAddress: null };
});

describe('intake-answer — reuse an existing instance (useItemUUID)', () => {
  it('binds the scanned serial to the chosen instance instead of minting a new one', async () => {
    const req = makeRequest('/api/intake/SN:SN-MATCH/answer', {
      type: 'ref',
      artikelNummer: '100',
      useItemUUID: 'I-100-0007',
      scanPayload: { serial: 'SN-MATCH', mac: null },
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, {});

    expect(getStatus()).toBe(200);
    expect(getBody().nextStep).toBe('quality');
    expect(getBody().itemUUID).toBe('I-100-0007');
    // No new instance created.
    expect(persistItemInstance).not.toHaveBeenCalled();
    // Serial bound to the existing instance + history recorded.
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE items SET "SerialNumber"'),
      expect.arrayContaining(['SN-MATCH', null, expect.any(String), 'I-100-0007'])
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'InstanceMatched', EntityId: 'I-100-0007' })
    );
  });

  it('rejects matching onto an instance of a different reference (409)', async () => {
    existingItem = { Artikel_Nummer: '999', SerialNumber: null, MacAddress: null };
    const req = makeRequest('/api/intake/SN:SN-MATCH/answer', {
      type: 'ref',
      artikelNummer: '100',
      useItemUUID: 'I-999-0001',
      scanPayload: { serial: 'SN-MATCH', mac: null },
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, {});

    expect(getStatus()).toBe(409);
    expect(persistItemInstance).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects re-matching an instance that already carries a different serial (409)', async () => {
    existingItem = { Artikel_Nummer: '100', SerialNumber: 'OTHER-SN', MacAddress: null };
    const req = makeRequest('/api/intake/SN:SN-MATCH/answer', {
      type: 'ref',
      artikelNummer: '100',
      useItemUUID: 'I-100-0007',
      scanPayload: { serial: 'SN-MATCH', mac: null },
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, {});

    expect(getStatus()).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });
});
