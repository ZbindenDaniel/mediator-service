import type { IncomingMessage, ServerResponse } from 'http';
import { ItemEinheit } from '../../../models';
import action from '../save-item';

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

describe('save-item action', () => {
  it('matches save item routes', () => {
    expect(action.matches('/api/items/ITEM-1', 'GET')).toBe(true);
  });

  it('returns item detail payloads for GET requests', async () => {
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-1',
          Artikel_Nummer: 'ART-1',
          BoxID: 'BOX-1',
          Einheit: ItemEinheit.Stk,
          Quality: 1,
          Grafikname: ''
        }))
      },
      getBox: {
        get: jest.fn(() => ({ BoxID: 'BOX-1', Label: 'Box 1' }))
      },
      listEventsForItem: {
        all: jest.fn(() => [])
      },
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-1' }))
      }
    };

    const req = createRequest('/api/items/ITEM-1');
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[save-item.test] handle failed', { error });
      throw error;
    }

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.item).toEqual(expect.objectContaining({ ItemUUID: 'ITEM-1', Artikel_Nummer: 'ART-1' }));
    expect(body.reference).toEqual(expect.objectContaining({ Artikel_Nummer: 'ART-1' }));
    expect(Array.isArray(body.media)).toBe(true);
  });
});
