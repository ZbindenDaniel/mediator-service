import type { IncomingMessage, ServerResponse } from 'http';
import action from '../recent-activities';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

async function call(url: string, page = { events: [{ Id: 1 }], nextCursor: '2026-01-01T00:00:00.000Z|1' }) {
  const ctx = { listActivities: jest.fn(async () => page) };
  const { res, getStatus, getBody } = createMockResponse();
  await action.handle({ url } as IncomingMessage, res, ctx);
  return { ctx, status: getStatus(), body: getBody() };
}

describe('recent-activities action', () => {
  it('defaults to 100 rows with no filters and returns the cursor', async () => {
    const { ctx, status, body } = await call('/api/activities');
    expect(status).toBe(200);
    expect(ctx.listActivities).toHaveBeenCalledWith({
      limit: 100, before: null, actor: null, term: null, boxId: null, topics: [], levels: []
    });
    expect(body).toEqual({ events: [{ Id: 1 }], nextCursor: '2026-01-01T00:00:00.000Z|1' });
  });

  it('passes topics, levels and cursor through to the query (server-side filtering)', async () => {
    const { ctx } = await call('/api/activities?topics=logistics,agentic&levels=important,Error&before=abc%7C5&actor=anna&term=R-1');
    expect(ctx.listActivities).toHaveBeenCalledWith(expect.objectContaining({
      topics: ['logistics', 'agentic'],
      levels: ['Important', 'Error'],
      before: 'abc|5',
      actor: 'anna',
      term: 'R-1'
    }));
  });

  it('drops unknown topics/levels and clamps the limit', async () => {
    const { ctx } = await call('/api/activities?topics=bogus&levels=verbose&limit=9999');
    expect(ctx.listActivities).toHaveBeenCalledWith(expect.objectContaining({ topics: [], levels: [], limit: 500 }));
  });

  it('returns 500 when the query fails', async () => {
    const ctx = { listActivities: jest.fn(async () => { throw new Error('boom'); }) };
    const { res, getStatus } = createMockResponse();
    await action.handle({ url: '/api/activities' } as IncomingMessage, res, ctx);
    expect(getStatus()).toBe(500);
  });
});
