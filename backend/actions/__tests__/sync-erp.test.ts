import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import action, {
  buildErpSyncScriptEnv,
  resolveArtikelNummerMirrorScope,
  resolveExplicitMediaMirrorSources
} from '../sync-erp';
import { MEDIA_DIR } from '../../lib/media';

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
    const logger: Pick<Console, 'info' | 'warn' | 'error'> = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

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
    const logger: Pick<Console, 'info' | 'warn' | 'error'> = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

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

  it('resolves explicit media file paths from ImageNames and Grafikname fallback', () => {
    const mediaFolderOne = `__test-sync-erp-${Date.now()}-1`;
    const mediaFolderTwo = `__test-sync-erp-${Date.now()}-2`;
    fs.mkdirSync(path.join(MEDIA_DIR, mediaFolderOne), { recursive: true });
    fs.mkdirSync(path.join(MEDIA_DIR, mediaFolderTwo), { recursive: true });

    const first = path.join(MEDIA_DIR, mediaFolderOne, 'A.jpg');
    const second = path.join(MEDIA_DIR, mediaFolderTwo, 'B.png');
    fs.writeFileSync(first, 'a');
    fs.writeFileSync(second, 'b');

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const resolved = resolveExplicitMediaMirrorSources(
      [
        { ItemUUID: 'I-1', Artikel_Nummer: 'ART-1', ImageNames: `/media/${mediaFolderOne}/A.jpg|/media/${mediaFolderOne}/missing.jpg` },
        { ItemUUID: 'I-2', Artikel_Nummer: 'ART-2', ImageNames: '   ', Grafikname: `/media/${mediaFolderTwo}/B.png` },
        { ItemUUID: 'I-3', Artikel_Nummer: 'ART-3', ImageNames: '../escape.png' }
      ],
      logger
    );

    expect(resolved).toEqual(expect.arrayContaining([first, second]));
    expect(resolved).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalled();

    fs.rmSync(path.join(MEDIA_DIR, mediaFolderOne), { recursive: true, force: true });
    fs.rmSync(path.join(MEDIA_DIR, mediaFolderTwo), { recursive: true, force: true });
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


describe('sync-erp script env building', () => {
  const originalMirrorDir = process.env.ERP_MEDIA_MIRROR_DIR;

  afterEach(() => {
    if (originalMirrorDir === undefined) {
      delete process.env.ERP_MEDIA_MIRROR_DIR;
      return;
    }
    process.env.ERP_MEDIA_MIRROR_DIR = originalMirrorDir;
  });

  it('removes inherited ERP_MEDIA_MIRROR_DIR when mirroring is disabled', () => {
    process.env.ERP_MEDIA_MIRROR_DIR = './media/mirror';

    const env = buildErpSyncScriptEnv(['/mnt/media/a.jpg'], null, '/mnt/media/shopbilder');

    expect(env.ERP_MEDIA_MIRROR_DIR).toBeUndefined();
    expect(env.ERP_MEDIA_SOURCE_DIR).toBe('/mnt/media/shopbilder');
    expect(env.ERP_SYNC_ITEM_IDS).toBe('/mnt/media/a.jpg');
  });

  it('sets ERP_MEDIA_MIRROR_DIR when mirroring is enabled', () => {
    process.env.ERP_MEDIA_MIRROR_DIR = './media/mirror';

    const env = buildErpSyncScriptEnv(['/mnt/media/a.jpg', '/mnt/media/b.png'], '/mnt/root/shopbilder-import', '/mnt/root/shopbilder');

    expect(env.ERP_MEDIA_MIRROR_DIR).toBe('/mnt/root/shopbilder-import');
    expect(env.ERP_MEDIA_SOURCE_DIR).toBe('/mnt/root/shopbilder');
    expect(env.ERP_SYNC_ITEM_IDS).toBe('/mnt/media/a.jpg\n/mnt/media/b.png');
  });
});
