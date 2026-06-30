// agent-claim-job / agent-job-status actions — the AGENT_TOKEN-authenticated HTTP data plane
// the credential-free print-agent uses alongside the /agent WebSocket control plane
// (docs/PLANNING_multi_instance.md, Component 2).
import type { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';

jest.mock('../backend/config', () => ({
  AGENT_TOKEN: 'correct-token',
}));

jest.mock('../backend/db', () => ({
  claimNextLabelJobForAgent: jest.fn(async () => null),
  recoverStaleLabelJobs: jest.fn(async () => undefined),
  updateLabelJobStatus: jest.fn(async () => undefined),
  getItem: jest.fn(async () => null),
}));

jest.mock('../backend/lib/labelHtml', () => ({
  htmlForItem: jest.fn(async ({ outPath }: { outPath: string }) => {
    require('fs').writeFileSync(outPath, '<html>label</html>', 'utf8');
    return outPath;
  }),
}));

import claimAction from '../backend/actions/agent-claim-job';
import statusAction from '../backend/actions/agent-job-status';
import { claimNextLabelJobForAgent, updateLabelJobStatus, getItem } from '../backend/db';

const claimMock = claimNextLabelJobForAgent as jest.Mock;
const statusMock = updateLabelJobStatus as jest.Mock;
const getItemMock = getItem as jest.Mock;

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => {
      try { body = payload ? JSON.parse(payload) : undefined; } catch { body = payload; }
    }),
  } as unknown as ServerResponse;
  return { res, getStatus: () => statusCode, getBody: () => body };
}

function createRequest(url: string, headers: Record<string, string> = {}, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as any).url = url;
  (req as any).headers = headers;
  process.nextTick(() => {
    if (body !== undefined) {
      (req as unknown as EventEmitter).emit('data', Buffer.from(JSON.stringify(body)));
    }
    (req as unknown as EventEmitter).emit('end');
  });
  return req;
}

describe('agent-claim-job action', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects requests without the correct bearer token', async () => {
    const { res, getStatus } = createMockResponse();
    const req = createRequest('/api/agent/claim-job', { authorization: 'Bearer wrong' }, { queues: [] });
    await claimAction.handle(req, res, {});
    expect(getStatus()).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  test('returns job: null when nothing is queued', async () => {
    claimMock.mockResolvedValueOnce(null);
    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agent/claim-job', { authorization: 'Bearer correct-token' }, { queues: ['ShopQueue'] });
    await claimAction.handle(req, res, {});
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ job: null });
    expect(claimMock).toHaveBeenCalledWith(['ShopQueue']);
  });

  test('renders and returns HTML for a claimed job', async () => {
    claimMock.mockResolvedValueOnce({ Id: 1, ItemUUID: 'ITEM-1' });
    getItemMock.mockResolvedValueOnce({ ItemUUID: 'ITEM-1', Artikel_Nummer: 'A-1', Einheit: 'Stück' });
    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agent/claim-job', { authorization: 'Bearer correct-token' }, { queues: ['ShopQueue'] });
    await claimAction.handle(req, res, {});
    expect(getStatus()).toBe(200);
    expect(getBody().job).toEqual({ id: 1, itemUUID: 'ITEM-1' });
    expect(getBody().html).toContain('<html>');
  });

  test('marks the job as Error and returns job: null when the item is missing', async () => {
    claimMock.mockResolvedValueOnce({ Id: 2, ItemUUID: 'MISSING' });
    getItemMock.mockResolvedValueOnce(null);
    const { res, getBody } = createMockResponse();
    const req = createRequest('/api/agent/claim-job', { authorization: 'Bearer correct-token' }, { queues: ['ShopQueue'] });
    await claimAction.handle(req, res, {});
    expect(getBody()).toEqual({ job: null });
    expect(statusMock).toHaveBeenCalledWith(2, 'Error', 'item not found');
  });
});

describe('agent-job-status action', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects requests without the correct bearer token', async () => {
    const { res, getStatus } = createMockResponse();
    const req = createRequest('/api/agent/jobs/5/status', { authorization: 'Bearer wrong' }, { status: 'Done' });
    await statusAction.handle(req, res, {});
    expect(getStatus()).toBe(401);
    expect(statusMock).not.toHaveBeenCalled();
  });

  test('updates job status from the URL id and body', async () => {
    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agent/jobs/5/status', { authorization: 'Bearer correct-token' }, { status: 'Done' });
    await statusAction.handle(req, res, {});
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ ok: true });
    expect(statusMock).toHaveBeenCalledWith(5, 'Done', null);
  });

  test('rejects a missing status field', async () => {
    const { res, getStatus } = createMockResponse();
    const req = createRequest('/api/agent/jobs/5/status', { authorization: 'Bearer correct-token' }, {});
    await statusAction.handle(req, res, {});
    expect(getStatus()).toBe(400);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
