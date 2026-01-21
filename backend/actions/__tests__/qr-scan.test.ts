import type { IncomingMessage, ServerResponse } from 'http';
import action from '../qr-scan';

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

function createJsonRequest(url: string, body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  return {
    url,
    method: 'POST',
    headers: { 'user-agent': 'jest' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
    }
  } as IncomingMessage;
}

describe('qr-scan action', () => {
  it('matches QR scan log route', () => {
    expect(action.matches('/api/qr-scan/log', 'POST')).toBe(true);
  });

  it('logs QR scan events', async () => {
    const ctx = {
      logEvent: jest.fn()
    };

    const req = createJsonRequest('/api/qr-scan/log', {
      actor: 'Scanner',
      payload: { id: 'BOX-1', label: 'Shelf' }
    });
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await action.handle(req, res, ctx);
    } catch (error) {
      console.error('[qr-scan.test] handle failed', { error });
      throw error;
    }

    expect(ctx.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        Actor: 'Scanner',
        EntityType: 'Box',
        EntityId: 'BOX-1',
        Event: 'QrScanned'
      })
    );
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ ok: true });
  });
});
