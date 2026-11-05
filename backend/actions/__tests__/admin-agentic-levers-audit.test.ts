import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

// Admin auth is covered elsewhere; here we only care that a lever change leaves an audit row.
jest.mock('../../utils/admin-auth', () => ({ requireAdminAuth: jest.fn(() => true) }));
jest.mock('../../agentic', () => ({
  setAgenticFlag: jest.fn(async () => undefined),
  getSelfHealPreview: jest.fn(async () => ({})),
  requestSelfHealSweep: jest.fn(),
  runSelfHealSweepNow: jest.fn(async () => ({
    warmedUp: true,
    passes: [
      { ran: true, staleCount: 7, acted: 'rework', artikelNummer: 'R-1', restamped: 0 },
      { ran: true, staleCount: 6, acted: 'none', restamped: 2 }
    ]
  }))
}));

import flagsAction from '../admin-agentic-flags';
import dispatchAction from '../admin-agentic-dispatch';
import selfHealAction from '../admin-agentic-self-heal';

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};
  return req;
}

function response() {
  let status: number | undefined;
  const res = { writeHead: jest.fn((s: number) => { status = s; return res; }), end: jest.fn() } as any;
  return { res: res as ServerResponse, status: () => status };
}

function lastMeta(logEvent: jest.Mock) {
  return JSON.parse(logEvent.mock.calls[logEvent.mock.calls.length - 1][0].Meta);
}

describe('KI cockpit levers write audit events', () => {
  it('flag toggle logs AgenticFlagChanged with the authenticated actor', async () => {
    const ctx = { logEvent: jest.fn(), identity: { username: 'dana' } };
    const { res, status } = response();
    await flagsAction.handle(request('POST', '/api/admin/agentic-flags', { flag: 'autoApprove', enabled: false }), res, ctx);
    expect(status()).toBe(200);
    expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      Actor: 'dana', EntityType: 'Batch', Event: 'AgenticFlagChanged'
    }));
    expect(lastMeta(ctx.logEvent)).toEqual({ flag: 'autoApprove', enabled: false });
  });

  it('dispatch toggle logs only on an actual state change', async () => {
    let stored: string | null = 'true';
    const ctx = {
      logEvent: jest.fn(),
      getSystemSetting: jest.fn(async () => stored),
      setSystemSetting: jest.fn(async (_k: string, v: string) => { stored = v; })
    };
    await dispatchAction.handle(request('POST', '/api/admin/agentic-dispatch', { enabled: false }), response().res, ctx);
    await dispatchAction.handle(request('POST', '/api/admin/agentic-dispatch', { enabled: false }), response().res, ctx);
    expect(ctx.logEvent).toHaveBeenCalledTimes(1);
    expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({ Actor: 'admin', Event: 'AgenticDispatchToggled' }));
    expect(lastMeta(ctx.logEvent)).toEqual({ enabled: false });
  });

  it('manual self-heal logs one summary with counts', async () => {
    const ctx = { logEvent: jest.fn() };
    const { res, status } = response();
    await selfHealAction.handle(request('POST', '/api/admin/agentic-self-heal'), res, ctx);
    expect(status()).toBe(200);
    expect(ctx.logEvent).toHaveBeenCalledTimes(1);
    expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({ EntityType: 'Batch', Event: 'AgenticSelfHealTriggered' }));
    expect(lastMeta(ctx.logEvent)).toEqual({ staleCount: 7, enqueued: 1, restamped: 2, reason: null });
  });

  it('a lever still succeeds when event logging throws', async () => {
    const ctx = { logEvent: jest.fn(async () => { throw new Error('db down'); }) };
    const { res, status } = response();
    await flagsAction.handle(request('POST', '/api/admin/agentic-flags', { flag: 'autoRework', enabled: true }), res, ctx);
    expect(status()).toBe(200);
  });
});
