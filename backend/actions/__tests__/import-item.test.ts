import type { IncomingMessage, ServerResponse } from 'http';
import action from '../import-item';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res: Partial<ServerResponse> & { writeHead: jest.Mock; end: jest.Mock; writableEnded?: boolean } = {
    writeHead: jest.fn((status: number) => {
      statusCode = status;
      return res;
    }),
    end: jest.fn((payload?: any) => {
      body = payload ? JSON.parse(payload) : undefined;
    }),
    writableEnded: false
  } as any;

  return {
    res: res as ServerResponse,
    getStatus: () => statusCode,
    getBody: () => body
  };
}

function createFormRequest(url: string, form: Record<string, string>): IncomingMessage {
  const params = new URLSearchParams(form);
  const payload = params.toString();
  return {
    url,
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
    }
  } as IncomingMessage;
}

describe('import-item action', () => {
  it('matches import item route', () => {
    expect(action.matches('/api/import/item', 'POST')).toBe(true);
  });

  it('imports an item from a reference payload', async () => {
    const getItemMock = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ Artikel_Nummer: 'ART-1', BoxID: null });

    const ctx = {
      generateItemUUID: jest.fn(() => 'I-ART-0001'),
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-1', Artikelbeschreibung: 'Widget' }))
      },
      getItem: {
        get: getItemMock
      },
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      },
      persistItemWithinTransaction: jest.fn(),
      logEvent: jest.fn(),
      runUpsertBox: jest.fn(),
      agenticServiceEnabled: false
    };

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      Artikel_Nummer: 'ART-1'
    });
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[import-item.test] handle failed', { error });
      throw error;
    }

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        createdCount: 1,
        item: expect.objectContaining({ Artikel_Nummer: 'ART-1', ItemUUID: 'I-ART-0001' })
      })
    );
  });
});
