import type { IncomingMessage, ServerResponse } from 'http';
import action from '../list-boxes';

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

describe('list-boxes action', () => {
  it('matches list boxes route', () => {
    expect(action.matches('/api/boxes', 'GET')).toBe(true);
  });

  it('filters shelf boxes by category', async () => {
    const ctx = {
      listBoxes: {
        all: jest.fn(() => []),
        byType: jest.fn(() => [
          { BoxID: 'S-01-02-0012-03', LocationId: null },
          { BoxID: 'S-01-02-9999-01', LocationId: null }
        ])
      }
    };

    const req = createRequest('/api/boxes?type=S&category=12');
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[list-boxes.test] handle failed', { error });
      throw error;
    }

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.boxes).toHaveLength(1);
    expect(body.boxes[0]).toEqual(expect.objectContaining({ BoxID: 'S-01-02-0012-03' }));
  });
});
