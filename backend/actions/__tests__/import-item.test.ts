// TODO(agent): Expand import-item route test coverage for mixed create/update semantics if endpoint contracts evolve.
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

type TestCtxOverrides = Partial<Record<string, any>>;

function createTestContext(overrides: TestCtxOverrides = {}) {
  return {
    generateItemUUID: jest.fn(() => 'I-ART-0001'),
    getItemReference: {
      get: jest.fn(() => ({ Artikel_Nummer: 'ART-1', Artikelbeschreibung: 'Widget' }))
    },
    getItem: {
      get: jest.fn()
    },
    db: {
      transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
    },
    persistItemWithinTransaction: jest.fn(),
    logEvent: jest.fn(),
    runUpsertBox: jest.fn(),
    upsertAgenticRun: { run: jest.fn() },
    getAgenticRun: { get: jest.fn(() => null) },
    agenticServiceEnabled: false,
    ...overrides
  };
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

    const ctx = createTestContext({
      getItem: {
        get: getItemMock
      }
    });

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      Artikel_Nummer: 'ART-1'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

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

  it('accepts payload ItemUUID + Artikel_Nummer for new import and persists provided ItemUUID', async () => {
    const ctx = createTestContext({
      getItem: {
        get: jest
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce({ Artikel_Nummer: 'ART-2', BoxID: null })
      }
    });

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      ItemUUID: 'I-ART-2-0007',
      Artikel_Nummer: 'ART-2'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          ItemUUID: 'I-ART-2-0007',
          Artikel_Nummer: 'ART-2'
        })
      })
    );
    expect(ctx.generateItemUUID).not.toHaveBeenCalled();
    expect(ctx.getItem.get).toHaveBeenCalledWith('I-ART-2-0007');
  });

  it('rejects conflicting payload ItemUUID for new import', async () => {
    const ctx = createTestContext({
      getItem: {
        get: jest.fn(() => ({ ItemUUID: 'I-ART-2-0007', Artikel_Nummer: 'ART-EXISTING' }))
      }
    });

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      ItemUUID: 'I-ART-2-0007',
      Artikel_Nummer: 'ART-2'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(409);
    expect(getBody()).toEqual(
      expect.objectContaining({
        error: 'ItemUUID already exists for new item import',
        details: {
          ItemUUID: 'I-ART-2-0007',
          Artikel_Nummer: 'ART-2'
        }
      })
    );
    expect(ctx.persistItemWithinTransaction).not.toHaveBeenCalled();
  });

  it('persists payload UpdatedAt when provided with a valid timestamp', async () => {
    const ctx = createTestContext({
      getItem: {
        get: jest
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce({ Artikel_Nummer: 'ART-4', BoxID: null })
      }
    });

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      Artikel_Nummer: 'ART-4',
      UpdatedAt: '2024-01-15T12:34:56.000Z'
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(ctx.persistItemWithinTransaction).toHaveBeenCalled();
    const persistedPayload = ctx.persistItemWithinTransaction.mock.calls[0][0];
    expect((persistedPayload.UpdatedAt as Date).toISOString()).toBe('2024-01-15T12:34:56.000Z');
  });

  it('falls back to ingestion UpdatedAt and logs warning when payload UpdatedAt is invalid', async () => {
    const ctx = createTestContext({
      getItem: {
        get: jest
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce({ Artikel_Nummer: 'ART-5', BoxID: null })
      }
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      Artikel_Nummer: 'ART-5',
      UpdatedAt: 'not-a-date'
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(ctx.persistItemWithinTransaction).toHaveBeenCalled();
    const persistedPayload = ctx.persistItemWithinTransaction.mock.calls[0][0];
    expect(persistedPayload.UpdatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN((persistedPayload.UpdatedAt as Date).getTime())).toBe(false);
    expect(warnSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [
          '[import-item] Invalid UpdatedAt provided; defaulting to ingestion timestamp',
          expect.objectContaining({
            ItemUUID: 'I-ART-0001',
            updatedAtRaw: 'not-a-date'
          })
        ]
      ])
    );

    warnSpy.mockRestore();
  });

  it('preserves minted path behavior when payload ItemUUID is not provided', async () => {
    const ctx = createTestContext({
      generateItemUUID: jest.fn(() => 'I-ART-3-0001'),
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-3', Artikelbeschreibung: 'Widget 3' }))
      },
      getItem: {
        get: jest
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce({ Artikel_Nummer: 'ART-3', BoxID: null })
      }
    });

    const req = createFormRequest('/api/import/item', {
      actor: 'Tester',
      Artikel_Nummer: 'ART-3'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          ItemUUID: 'I-ART-3-0001',
          Artikel_Nummer: 'ART-3'
        })
      })
    );
    expect(ctx.generateItemUUID).toHaveBeenCalledWith('ART-3');
  });
});
