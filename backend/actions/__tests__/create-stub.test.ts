import type { IncomingMessage, ServerResponse } from 'http';
import action from '../create-stub';

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
  const req: any = { url, method: 'POST', headers: {}, on: undefined };
  req.on = (event: string, cb: (arg?: unknown) => void) => {
    if (event === 'data' && payload) cb(payload);
    if (event === 'end') cb();
    return req;
  };
  return req as IncomingMessage;
}

describe('create-stub action', () => {
  it('logs a StubCreated event keyed to the shelf on success', async () => {
    const logEvent = jest.fn(async () => undefined);
    const createStub = jest.fn(async () => undefined);
    const ctx = { createStub, logEvent };

    const req = makeRequest('/api/stubs', {
      shelfId: 'S-01',
      description: 'lose Teile',
      numberLooseItems: 3,
      createdBy: 'tester'
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(201);
    expect(createStub).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'StubCreated', EntityType: 'Box', EntityId: 'S-01', Actor: 'tester' })
    );
  });

  it('does not log when validation fails', async () => {
    const logEvent = jest.fn(async () => undefined);
    const createStub = jest.fn(async () => undefined);
    const ctx = { createStub, logEvent };

    const req = makeRequest('/api/stubs', { description: 'no shelf' });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(400);
    expect(createStub).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
