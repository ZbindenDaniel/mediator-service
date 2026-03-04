import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import action, { resolveArtikelNummerMirrorScope } from '../sync-erp';

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

function createJsonRequest(payload: unknown): IncomingMessage {
  const raw = JSON.stringify(payload);
  const req = Readable.from([raw]) as IncomingMessage;
  (req as any).url = '/api/sync/erp';
  (req as any).method = 'POST';
  return req;
}

describe('sync-erp payload normalization', () => {
  it('maps mixed duplicate instances to a unique Artikelnummer mirror scope', () => {
    const logger = { info: jest.fn(), warn: jest.fn() };

    const resolved = resolveArtikelNummerMirrorScope(
      [
        { ItemUUID: 'I-ALPHA-0001', Artikel_Nummer: '123' },
        { ItemUUID: 'I-ALPHA-0002', Artikel_Nummer: '000123' },
        { ItemUUID: 'I-BETA-0001', Artikel_Nummer: '77' }
      ],
      logger
    );

    expect(resolved).toEqual(['000123', '000077']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('generates explicit mirror scope list from normalized Artikelnummer values only', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const resolved = resolveArtikelNummerMirrorScope(
      [
        { ItemUUID: 'I-ALPHA-0001', Artikel_Nummer: '123' },
        { ItemUUID: 'I-BETA-0001', Artikel_Nummer: '77' },
        { ItemUUID: 'I-BETA-0002', Artikel_Nummer: '000077' }
      ],
      logger
    );

    expect(resolved).toEqual(['000123', '000077']);
  });

  it('rejects invalid path-like Artikelnummer values from mirror scope', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const resolved = resolveArtikelNummerMirrorScope(
      [
        { ItemUUID: 'I-PATH-0001', Artikel_Nummer: '../escape' },
        { ItemUUID: 'I-PATH-0002', Artikel_Nummer: 'folder/name' },
        { ItemUUID: 'I-VALID-0003', Artikel_Nummer: '88' }
      ],
      logger
    );

    expect(resolved).toEqual(['000088']);
    expect(logger.warn).toHaveBeenCalledWith('[sync-erp] artikelnummer_invalid_for_media_scope', {
      itemId: 'I-PATH-0001',
      artikelNummer: '../escape'
    });
    expect(logger.warn).toHaveBeenCalledWith('[sync-erp] artikelnummer_invalid_for_media_scope', {
      itemId: 'I-PATH-0002',
      artikelNummer: 'folder/name'
    });
  });


  it('warns and safely skips instances without Artikel_Nummer', () => {
    const logger = { info: jest.fn(), warn: jest.fn() };

    const resolved = resolveArtikelNummerMirrorScope(
      [
        { ItemUUID: 'I-MISSING-0001', Artikel_Nummer: null },
        { ItemUUID: 'I-WHITESPACE-0002', Artikel_Nummer: '   ' }
      ],
      logger
    );

    expect(resolved).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('[sync-erp] artikelnummer_missing_for_media_scope', {
      itemId: 'I-MISSING-0001'
    });
  });

  it('fails fast with 422 when no Artikelnummer values can be resolved', async () => {
    const req = createJsonRequest({ itemIds: ['I-MISSING-0001'] });
    const { res, getStatus, getBody } = createMockResponse();
    const ctx = {
      listItemsForExport: {
        all: jest.fn(() => [{ ItemUUID: 'I-MISSING-0001', Artikel_Nummer: null }])
      },
      listBoxes: {
        all: jest.fn(() => [])
      }
    };

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(422);
    expect(getBody()).toEqual(
      expect.objectContaining({
        ok: false,
        phase: 'export_staged',
        error: 'No Artikelnummer values resolved for media mirroring scope.'
      })
    );
  });
});
