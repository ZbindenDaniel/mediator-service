import type { IncomingMessage, ServerResponse } from 'http';
import action from '../list-items';

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

describe('list-items action', () => {
  it('matches list items route', () => {
    expect(action.matches('/api/items', 'GET')).toBe(true);
  });

  it('returns grouped and raw item data', async () => {
    const ctx = {
      listItemsWithFilters: {
        all: jest.fn(() => [
          {
            ItemUUID: 'I-ABC-0001',
            Artikel_Nummer: 'ABC',
            Quality: 1,
            BoxID: 'BOX-1',
            Location: null
          }
        ])
      },
      listItemReferencesWithFilters: {
        all: jest.fn(() => [])
      }
    };

    const req = createRequest('/api/items?search=widget');
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[list-items.test] handle failed', { error });
      throw error;
    }

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.groupedItems).toHaveLength(1);
    expect(body.groupedItems[0]).toEqual(
      expect.objectContaining({
        Artikel_Nummer: 'ABC',
        Quality: 1,
        BoxID: 'BOX-1',
        count: 1,
        representativeItemId: 'I-ABC-0001'
      })
    );
  });
});
