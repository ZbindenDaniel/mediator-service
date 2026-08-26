import type { IncomingMessage, ServerResponse } from 'http';

// ---- intake-start: surface pre-intake instances as matchable candidates at select_ref ----

const searchItemReferences = jest.fn(async () => [
  { Artikel_Nummer: '100', Hersteller: 'HP', Artikelbeschreibung: 'EliteBook 840', Hauptkategorien_A: 2, Unterkategorien_A: 201 },
]);

// queryOne → findItemByIdentifier (no item for this serial → select_ref branch).
// query → attachMatchableInstances (one serial-less instance of ref 100).
const startQueryOne = jest.fn(async () => null);
const startQuery = jest.fn(async () => [
  { ItemUUID: 'I-100-0007', Artikel_Nummer: '100', BoxID: 'B-1', BoxLabel: 'Shelf A', Location: 'A1', Quality: 4, Datum_erfasst: '2024-01-01' },
]);

jest.mock('../../db-client', () => ({
  queryOne: (...a: unknown[]) => startQueryOne(...a),
  query: (...a: unknown[]) => startQuery(...a),
  execute: jest.fn(async () => undefined),
}));
jest.mock('../../db', () => ({ IN_DEVICE_COMPONENT_SQL: '(1=1)' }));
jest.mock('../../utils/intake-auth', () => ({ requireIntakeAuth: jest.fn(() => true) }));
jest.mock('../search', () => ({ searchItemReferences: (...a: unknown[]) => searchItemReferences(...a) }));

import startAction from '../intake-start';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const req: any = { url, method: 'POST', headers: {} };
  req[Symbol.asyncIterator] = async function* () { yield payload; };
  return req as IncomingMessage;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('intake-start — matchable instance surfacing', () => {
  it('attaches serial-less instances of a candidate ref so the operator can pick new-or-existing', async () => {
    const req = makeRequest('/api/intake/start', { serial: 'SN-NEW', vendor: 'HP', model: 'EliteBook 840' });
    const { res, getStatus, getBody } = createMockResponse();

    await startAction.handle(req, res);

    expect(getStatus()).toBe(200);
    expect(getBody().nextStep).toBe('select_ref');
    const cand = getBody().candidates[0];
    expect(cand.artikelNummer).toBe('100');
    expect(cand.matchableInstances).toHaveLength(1);
    expect(cand.matchableInstances[0]).toMatchObject({ itemUUID: 'I-100-0007', boxLabel: 'Shelf A', quality: 4 });
  });
});
