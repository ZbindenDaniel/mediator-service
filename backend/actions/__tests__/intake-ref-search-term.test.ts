import type { IncomingMessage, ServerResponse } from 'http';

// ---- intake-start: DMI vendor noise must not starve the ref candidate search ----

const searchItemReferences = jest.fn(async (_term: string) => [] as any[]);

jest.mock('../../db-client', () => ({
  queryOne: jest.fn(async () => null), // no item for this serial → select_ref branch
  query: jest.fn(async () => []),      // no matchable instances
  execute: jest.fn(async () => undefined),
}));
jest.mock('../../db', () => ({ IN_DEVICE_COMPONENT_SQL: '(1=1)' }));
jest.mock('../../utils/intake-auth', () => ({ requireIntakeAuth: jest.fn(() => true) }));
jest.mock('../search', () => ({ searchItemReferences: (...a: any[]) => searchItemReferences(a[0]) }));

import startAction, { buildRefSearchTerm } from '../intake-start';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const req: any = { url: '/api/intake/start', method: 'POST', headers: {} };
  req[Symbol.asyncIterator] = async function* () { yield payload; };
  return req as IncomingMessage;
}

describe('buildRefSearchTerm', () => {
  it('strips (R)/(TM) marks, corporate filler and duplicate tokens', () => {
    // The real case from the log: 5 tokens → needs 3 hits, "Intel NUC …" refs only hit 2.
    expect(buildRefSearchTerm('Intel(R) Client Systems', 'intel nuc')).toBe('Intel nuc');
    expect(buildRefSearchTerm('Dell Inc.', 'Latitude 7490')).toBe('Dell Latitude 7490');
    expect(buildRefSearchTerm('ASUSTeK COMPUTER INC.', 'X550CC')).toBe('ASUSTeK X550CC');
    expect(buildRefSearchTerm('Micro-Star International Co., Ltd.', 'MS-7B79')).toBe('Micro-Star MS-7B79');
  });

  it('keeps the model untouched when there is no filler', () => {
    expect(buildRefSearchTerm('LENOVO', '20KHCTO1WW')).toBe('LENOVO 20KHCTO1WW');
    expect(buildRefSearchTerm(null, 'ThinkPad X1')).toBe('ThinkPad X1');
    expect(buildRefSearchTerm(null, null)).toBe('');
  });
});

describe('intake-start ref candidate fallback', () => {
  beforeEach(() => { searchItemReferences.mockReset(); searchItemReferences.mockResolvedValue([]); });

  it('searches the cleaned vendor+model term first', async () => {
    searchItemReferences.mockResolvedValueOnce([
      { Artikel_Nummer: '500', Hersteller: 'Intel', Artikelbeschreibung: 'Intel NUC 8', Hauptkategorien_A: 1, Unterkategorien_A: 101 },
    ]);
    const { res, getStatus, getBody } = createMockResponse();
    await startAction.handle(makeRequest({ serial: 'SN-NUC', vendor: 'Intel(R) Client Systems', model: 'intel nuc' }), res);
    expect(getStatus()).toBe(200);
    expect(searchItemReferences).toHaveBeenCalledTimes(1);
    expect(searchItemReferences).toHaveBeenCalledWith('Intel nuc');
    expect(getBody().nextStep).toBe('select_ref');
    expect(getBody().candidates.map((c: any) => c.artikelNummer)).toEqual(['500']);
  });

  it('falls back to model-only, then vendor-only, when the combined term finds nothing', async () => {
    searchItemReferences
      .mockResolvedValueOnce([]) // "HP EliteBook 840 G5"
      .mockResolvedValueOnce([]) // "EliteBook 840 G5"
      .mockResolvedValueOnce([
        { Artikel_Nummer: '7', Hersteller: 'HP', Artikelbeschreibung: 'HP Notebook', Hauptkategorien_A: 2, Unterkategorien_A: 201 },
      ]); // "HP"
    const { res, getBody } = createMockResponse();
    await startAction.handle(makeRequest({ serial: 'SN-HP', vendor: 'HP', model: 'EliteBook 840 G5' }), res);
    expect(searchItemReferences.mock.calls.map(c => c[0])).toEqual(['HP EliteBook 840 G5', 'EliteBook 840 G5', 'HP']);
    expect(getBody().candidates.map((c: any) => c.artikelNummer)).toEqual(['7']);
  });

  it('does not repeat an identical term when vendor is empty', async () => {
    const { res, getBody } = createMockResponse();
    await startAction.handle(makeRequest({ serial: 'SN-X', vendor: null, model: 'ThinkPad X1' }), res);
    expect(searchItemReferences.mock.calls.map(c => c[0])).toEqual(['ThinkPad X1']);
    expect(getBody().candidates).toEqual([]);
  });
});
