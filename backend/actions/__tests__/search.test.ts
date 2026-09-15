import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn({})),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 0),
  execBatch: jest.fn(async () => undefined),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

import action from '../search';
import * as dbClient from '../../db-client';

const mockQuery = dbClient.query as jest.Mock;

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res: Partial<ServerResponse> & { writeHead: jest.Mock; end: jest.Mock } = {
    writeHead: jest.fn((status: number) => {
      statusCode = status;
      return res;
    }),
    end: jest.fn((payload?: any) => {
      body = payload ? JSON.parse(payload) : undefined;
    })
  } as any;

  return {
    res: res as ServerResponse,
    getStatus: () => statusCode,
    getBody: () => body
  };
}

function createRequest(url: string): IncomingMessage {
  return { url, method: 'GET' } as IncomingMessage;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe('search action', () => {
  it('matches search route', () => {
    expect(action.matches('/api/search', 'GET')).toBe(true);
  });

  it('returns reference results when scope=refs', async () => {
    const rawRefs = [
      {
        Artikel_Nummer: 'A-1',
        Artikelbeschreibung: 'Widget',
        Kurzbeschreibung: 'Widget',
        Langtext: '',
        Hersteller: 'Acme',
        token_hits: 1,
        exact_match: 1,
        sql_score: 0.95,
        exemplar_item_uuid: 'I-A-0001',
        exemplar_box_id: 'BOX-1',
        exemplar_location: 'Shelf-1'
      }
    ];

    mockQuery.mockResolvedValue(rawRefs);

    const ctx = {};
    const req = createRequest('/api/search?term=widget&scope=refs');
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[search.test] handle failed', { error });
      throw error;
    }

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.scope).toBe('refs');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        Artikel_Nummer: 'A-1',
        exemplarItemUUID: 'I-A-0001',
        exemplarBoxID: 'BOX-1',
        exemplarLocation: 'Shelf-1'
      })
    );
    expect(body.relaxed).toBe(false);
  });

  // The 50 % token rule lives in JS now (SQL only requires one hit) so that a term nobody
  // clears still yields the best weaker matches instead of an empty list.
  describe('token threshold relaxation', () => {
    const ref = (num: string, desc: string, tokenHits: number) => ({
      Artikel_Nummer: num, Artikelbeschreibung: desc, Kurzbeschreibung: desc, Langtext: '', Hersteller: 'Intel',
      token_hits: tokenHits, exact_match: 0, sql_score: tokenHits / 5,
      exemplar_item_uuid: null, exemplar_box_id: null, exemplar_location: null
    });

    it('asks SQL for any-hit rows and keeps only rows reaching 50 % when some do', async () => {
      // 4 tokens → needs 2. One ref reaches it, one does not → strict set only.
      mockQuery.mockResolvedValue([ref('A', 'Intel NUC 8', 2), ref('B', 'Intel Core i5 CPU', 1)]);
      const req = createRequest('/api/search?term=intel%20nuc%20kit%20nuc8&scope=refs');
      const { res, getBody } = createMockResponse();
      await action.handle(req, res, {});
      const body = getBody();
      expect(body.items.map((r: any) => r.Artikel_Nummer)).toEqual(['A']);
      expect(body.relaxed).toBe(false);
      // The WHERE threshold is the last positional param of the refs query — always 1 now.
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[params.length - 1]).toBe(1);
    });

    it('falls back to the best weaker matches and flags relaxed when nobody reaches 50 %', async () => {
      // "Intel(R) Client Systems intel nuc" = 5 tokens → needs 3; both refs only hit 2 / 1.
      mockQuery.mockResolvedValue([ref('A', 'Intel NUC 8', 2), ref('B', 'Intel Core i5 CPU', 1)]);
      const req = createRequest('/api/search?term=Intel(R)%20Client%20Systems%20intel%20nuc&scope=refs');
      const { res, getBody } = createMockResponse();
      await action.handle(req, res, {});
      const body = getBody();
      expect(body.items.map((r: any) => r.Artikel_Nummer)).toEqual(['A', 'B']);
      expect(body.relaxed).toBe(true);
    });

    it('relaxes item + box results the same way', async () => {
      const item = { ItemUUID: 'I-1', Artikel_Nummer: 'A', Artikelbeschreibung: 'Intel NUC 8', Einheit: 'Stück', Auf_Lager: 1, token_hits: 1, exact_match: 0, sql_score: 0.2 };
      const box = { BoxID: 'B-1', Label: 'NUC shelf', token_hits: 1, exact_match: 0, sql_score: 0.2 };
      mockQuery.mockResolvedValueOnce([item]).mockResolvedValueOnce([box]);
      const req = createRequest('/api/search?term=Intel(R)%20Client%20Systems%20intel%20nuc');
      const { res, getBody } = createMockResponse();
      await action.handle(req, res, {});
      const body = getBody();
      expect(body.items.map((r: any) => r.ItemUUID)).toEqual(['I-1']);
      expect(body.boxes.map((b: any) => b.BoxID)).toEqual(['B-1']);
      expect(body.relaxed).toBe(true);
    });

    it('still returns nothing when there is no hit at all', async () => {
      const req = createRequest('/api/search?term=zzz&scope=refs');
      const { res, getBody } = createMockResponse();
      await action.handle(req, res, {});
      expect(getBody().items).toEqual([]);
      expect(getBody().relaxed).toBe(false);
    });
  });
});
