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
  });
});
