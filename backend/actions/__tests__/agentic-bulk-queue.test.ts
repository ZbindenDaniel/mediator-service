import type { IncomingMessage, ServerResponse } from 'http';
import action from '../agentic-bulk-queue';

describe('agentic-bulk-queue action', () => {
  function createMockResponse() {
    let statusCode: number | undefined;
    let body: any;
    const res: Partial<ServerResponse> & { writeHead: jest.Mock; end: jest.Mock } = {
      writeHead: jest.fn((status: number, headers?: Record<string, string>) => {
        statusCode = status;
        return res;
      }),
      end: jest.fn((payload?: any) => {
        try {
          body = payload ? JSON.parse(payload) : undefined;
        } catch {
          body = payload;
        }
      })
    } as any;

    return {
      res: res as unknown as ServerResponse,
      getStatus: () => statusCode,
      getBody: () => body
    };
  }

  function createRequest(path: string): IncomingMessage {
    return { url: path } as IncomingMessage;
  }

  it('skips items with existing runs when mode is missing', async () => {
    const items = [
      { ItemUUID: 'item-1', Artikel_Nummer: 'R-001' },
      { ItemUUID: 'item-2', Artikel_Nummer: 'R-002' }
    ];
    const references: Array<{ Artikel_Nummer?: string }> = [];
    const ctx = {
      listItems: { all: jest.fn(() => items) },
      listItemReferences: { all: jest.fn(() => references) },
      getItemReference: {
        get: jest.fn((id: string) => ({ Artikel_Nummer: id }))
      },
      getAgenticRun: {
        get: jest.fn((id: string) => (id === 'R-001' ? { Artikel_Nummer: id, Status: 'completed', SearchQuery: 'foo' } : undefined))
      },
      upsertAgenticRun: {
        run: jest.fn(() => ({ changes: 1 }))
      },
      logEvent: jest.fn(),
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      }
    };

    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agentic/queue?mode=missing&actor=tester');

    await action.handle(req, res, ctx);

    expect(ctx.listItems.all).toHaveBeenCalled();
    expect(ctx.listItemReferences.all).toHaveBeenCalled();
    expect(ctx.getAgenticRun.get).toHaveBeenCalledTimes(2);
    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(1);
    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-002', Status: 'queued', ReviewState: 'not_required' })
    );
    expect(ctx.logEvent).toHaveBeenCalledTimes(1);
    expect(ctx.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ EntityId: 'R-002', Actor: 'tester', Event: 'AgenticSearchQueued' })
    );
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(expect.objectContaining({ queued: 1, skipped: 1, mode: 'missing', total: 2 }));
  });

  it('queues all items when mode is all even if runs exist', async () => {
    const items = [
      { ItemUUID: 'item-1', Artikel_Nummer: 'R-001' },
      { ItemUUID: 'item-2', Artikel_Nummer: 'R-002' }
    ];
    const references: Array<{ Artikel_Nummer?: string }> = [];
    const ctx = {
      listItems: { all: jest.fn(() => items) },
      listItemReferences: { all: jest.fn(() => references) },
      getItemReference: {
        get: jest.fn((id: string) => ({ Artikel_Nummer: id }))
      },
      getAgenticRun: {
        get: jest.fn(() => ({ Artikel_Nummer: 'R-001', Status: 'completed', SearchQuery: 'foo' }))
      },
      upsertAgenticRun: {
        run: jest.fn(() => ({ changes: 1 }))
      },
      logEvent: jest.fn(),
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      }
    };

    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agentic/queue?mode=all&actor=tester');

    await action.handle(req, res, ctx);

    expect(ctx.listItems.all).toHaveBeenCalled();
    expect(ctx.listItemReferences.all).toHaveBeenCalled();
    expect(ctx.getAgenticRun.get).toHaveBeenCalledTimes(2);
    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(2);
    expect(ctx.logEvent).toHaveBeenCalledTimes(2);
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(expect.objectContaining({ queued: 2, skipped: 0, mode: 'all', total: 2 }));
  });

  it('skips reference-only rows when mode is instancesOnly', async () => {
    const references = [{ Artikel_Nummer: 'R-001' }];
    const ctx = {
      listItems: { all: jest.fn(() => []) },
      listItemReferences: { all: jest.fn(() => references) },
      getItemReference: {
        get: jest.fn((id: string) => ({ Artikel_Nummer: id }))
      },
      getAgenticRun: { get: jest.fn(() => undefined) },
      upsertAgenticRun: { run: jest.fn(() => ({ changes: 1 })) },
      logEvent: jest.fn(),
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      }
    };

    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agentic/queue?mode=instancesOnly&actor=tester');

    await action.handle(req, res, ctx);

    expect(ctx.listItemReferences.all).toHaveBeenCalled();
    expect(ctx.getAgenticRun.get).not.toHaveBeenCalled();
    expect(ctx.upsertAgenticRun.run).not.toHaveBeenCalled();
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(expect.objectContaining({ queued: 0, skipped: 1, total: 1 }));
  });

  it('queues reference-only rows without existing runs when mode is missing', async () => {
    const references = [{ Artikel_Nummer: 'R-001' }, { Artikel_Nummer: 'R-002' }];
    const ctx = {
      listItems: { all: jest.fn(() => []) },
      listItemReferences: { all: jest.fn(() => references) },
      getItemReference: {
        get: jest.fn((id: string) => ({ Artikel_Nummer: id }))
      },
      getAgenticRun: {
        get: jest.fn((id: string) => (id === 'R-001' ? { Artikel_Nummer: id, Status: 'queued' } : undefined))
      },
      upsertAgenticRun: { run: jest.fn(() => ({ changes: 1 })) },
      logEvent: jest.fn(),
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      }
    };

    const { res, getStatus, getBody } = createMockResponse();
    const req = createRequest('/api/agentic/queue?mode=missing&actor=tester');

    await action.handle(req, res, ctx);

    expect(ctx.getAgenticRun.get).toHaveBeenCalledTimes(2);
    expect(ctx.upsertAgenticRun.run).toHaveBeenCalledTimes(1);
    expect(ctx.logEvent).toHaveBeenCalledTimes(1);
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(expect.objectContaining({ queued: 1, skipped: 1, total: 2 }));
  });
});
