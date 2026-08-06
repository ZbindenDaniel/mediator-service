import type { IncomingMessage, ServerResponse } from 'http';

// intake-answer uses direct module imports (not ctx), so mock the db + helper modules.
const logEvent = jest.fn(async () => undefined);
const persistItemInstance = jest.fn(async () => undefined);
const persistItemReference = jest.fn(async () => undefined);

jest.mock('../../db', () => ({
  persistItemReference: (...args: unknown[]) => persistItemReference(...args),
  persistItemInstance: (...args: unknown[]) => persistItemInstance(...args),
  insertQualityAssessment: jest.fn(async () => 1),
  updateItemQualityAssessment: jest.fn(async () => undefined),
  updateItemInstanceSpecs: jest.fn(async () => undefined),
  getMaxArtikelNummer: jest.fn(async () => '100'),
  getMaxItemId: jest.fn(async () => null),
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

jest.mock('../../db-client', () => ({
  // Ref lookup returns an existing reference; item lookup returns null so a new item is minted.
  queryOne: jest.fn(async (sql: string) =>
    /FROM item_refs/.test(sql)
      ? { Artikel_Nummer: '100', Hersteller: 'HP', Kurzbeschreibung: 'Laptop', Unterkategorien_A: '201' }
      : null
  ),
}));

jest.mock('../../lib/itemIds', () => ({
  generateItemUUID: jest.fn(async () => 'I-100-0001'),
}));

jest.mock('../../utils/intake-auth', () => ({
  requireIntakeAuth: jest.fn(() => true),
}));

jest.mock('../../lib/quality-contracts', () => ({
  loadGeneralContract: jest.fn(() => ({ questions: [] })),
  loadSubCategoryContract: jest.fn(() => ({ questions: [] })),
  assemblyToQualityContract: jest.fn(() => ({ questions: [] })),
  buildQualityCheckResponse: jest.fn(() => ({ qualityTag: 'good', qualityValue: 4, derivedSpecs: {}, answers: {} })),
}));

jest.mock('../../contracts/registry', () => ({
  getAssemblyContract: jest.fn(() => null),
}));

jest.mock('../../lib/intake-quality-map', () => ({
  resolveIntakeQuestions: jest.fn(() => ({ ask: [], autoAnswers: {} })),
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
  req[Symbol.asyncIterator] = async function* () {
    if (payload) yield payload;
  };
  return req as IncomingMessage;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('intake-answer action', () => {
  it('logs a Created event when the ref step mints a new item instance', async () => {
    const req = makeRequest('/api/intake/SN:SN1/answer', {
      type: 'ref',
      artikelNummer: '100',
      scanPayload: { serial: 'SN1', mac: null },
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, {});

    expect(getStatus()).toBe(200);
    expect(persistItemInstance).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'Created', EntityType: 'Item', EntityId: 'I-100-0001' })
    );
  });
});
