import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import action, {
  buildErpSyncScriptEnv,
  resolveArtikelNummerMirrorScope,
  resolveExplicitMediaMirrorSources,
  resolveErpSyncScriptPath,
  validateErpSyncScriptPath
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

  it('resolves filename-only metadata entries via Artikel_Nummer media folder conventions', () => {
    const mediaFolder = '019865';
    const mediaFile = path.join(MEDIA_DIR, mediaFolder, '019865-1.jpg');
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, 'a');

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const resolved = resolveExplicitMediaMirrorSources(
      [{ ItemUUID: 'I-1', Artikel_Nummer: '19865', ImageNames: '019865-1.jpg' }],
      logger
    );

    expect(resolved).toEqual([mediaFile]);
    expect(logger.info).toHaveBeenCalledWith('[sync-erp] media_entry_filename_resolved', {
      itemId: 'I-1',
      artikelNummer: '19865',
      entry: '019865-1.jpg',
      resolvedRelativePath: '019865/019865-1.jpg'
    });

    fs.rmSync(path.join(MEDIA_DIR, mediaFolder), { recursive: true, force: true });
  });

  it('preserves legacy path-like metadata entries for compatibility', () => {
    const mediaFolder = `__test-sync-erp-${Date.now()}-legacy`;
    const mediaFile = path.join(MEDIA_DIR, mediaFolder, 'B.png');
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, 'b');

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const resolved = resolveExplicitMediaMirrorSources(
      [{ ItemUUID: 'I-2', Artikel_Nummer: 'ART-2', Grafikname: `/media/${mediaFolder}/B.png` }],
      logger
    );

    expect(resolved).toEqual([mediaFile]);
    expect(logger.info).toHaveBeenCalledWith('[sync-erp] media_entry_legacy_path_resolved', {
      itemId: 'I-2',
      artikelNummer: 'ART-2',
      entry: `/media/${mediaFolder}/B.png`,
      resolvedRelativePath: `${mediaFolder}/B.png`
    });

    fs.rmSync(path.join(MEDIA_DIR, mediaFolder), { recursive: true, force: true });
  });

  it('logs and skips missing-file and invalid-entry metadata values', () => {
    const mediaFolder = `__test-sync-erp-${Date.now()}-missing`;
    fs.mkdirSync(path.join(MEDIA_DIR, mediaFolder), { recursive: true });
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const resolved = resolveExplicitMediaMirrorSources(
      [
        { ItemUUID: 'I-3', Artikel_Nummer: 'ART-3', ImageNames: `/media/${mediaFolder}/missing.jpg` },
        { ItemUUID: 'I-4', Artikel_Nummer: 'ART-4', ImageNames: '../escape.png' }
      ],
      logger
    );

    expect(resolved).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('[sync-erp] media_entry_missing_skipped', expect.objectContaining({
      itemId: 'I-3',
      artikelNummer: 'ART-3',
      entry: `/media/${mediaFolder}/missing.jpg`,
      reason: 'missing-in-source-roots'
    }));
    expect(logger.warn).toHaveBeenCalledWith('[sync-erp] media_entry_invalid_skipped', {
      itemId: 'I-4',
      artikelNummer: 'ART-4',
      entry: '../escape.png',
      reason: 'invalid-legacy-path-entry'
    });

    fs.rmSync(path.join(MEDIA_DIR, mediaFolder), { recursive: true, force: true });
  });


  it('prefers staged source roots when both staged and ERP fetch files exist', () => {
    const scope = `__test-sync-erp-${Date.now()}-precedence`;
    const stagingRoot = path.join(MEDIA_DIR, scope, 'staging');
    const fetchRoot = path.join(MEDIA_DIR, scope, 'fetch');
    const relativePath = '000123/A.jpg';
    const stagedFile = path.join(stagingRoot, relativePath);
    const fetchFile = path.join(fetchRoot, relativePath);

    fs.mkdirSync(path.dirname(stagedFile), { recursive: true });
    fs.mkdirSync(path.dirname(fetchFile), { recursive: true });
    fs.writeFileSync(stagedFile, 'staged');
    fs.writeFileSync(fetchFile, 'fetch');

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const resolved = resolveExplicitMediaMirrorSources(
      [{ ItemUUID: 'I-5', Artikel_Nummer: '123', ImageNames: 'A.jpg' }],
      logger,
      {
        sourceRoots: [
          { root: stagingRoot, origin: 'staging' },
          { root: fetchRoot, origin: 'erp-fetch-root' }
        ]
      }
    );

    expect(resolved).toEqual([stagedFile]);
    expect(logger.info).toHaveBeenCalledWith('[sync-erp] media_entry_source_selected', {
      itemId: 'I-5',
      artikelNummer: '123',
      entry: 'A.jpg',
      resolvedPath: stagedFile,
      sourceOrigin: 'staging'
    });

    fs.rmSync(path.join(MEDIA_DIR, scope), { recursive: true, force: true });
  });

  it('falls back to ERP fetch root and tags source origin when staging file is absent', () => {
    const scope = `__test-sync-erp-${Date.now()}-fallback`;
    const stagingRoot = path.join(MEDIA_DIR, scope, 'staging');
    const fetchRoot = path.join(MEDIA_DIR, scope, 'fetch');
    const relativePath = '000124/B.jpg';
    const fetchFile = path.join(fetchRoot, relativePath);

    fs.mkdirSync(stagingRoot, { recursive: true });
    fs.mkdirSync(path.dirname(fetchFile), { recursive: true });
    fs.writeFileSync(fetchFile, 'fetch');

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const resolved = resolveExplicitMediaMirrorSources(
      [{ ItemUUID: 'I-6', Artikel_Nummer: '124', ImageNames: 'B.jpg' }],
      logger,
      {
        sourceRoots: [
          { root: stagingRoot, origin: 'staging' },
          { root: fetchRoot, origin: 'erp-fetch-root' }
        ]
      }
    );

    expect(resolved).toEqual([fetchFile]);
    expect(logger.info).toHaveBeenCalledWith('[sync-erp] media_entry_source_selected', {
      itemId: 'I-6',
      artikelNummer: '124',
      entry: 'B.jpg',
      resolvedPath: fetchFile,
      sourceOrigin: 'erp-fetch-root'
    });

    fs.rmSync(path.join(MEDIA_DIR, scope), { recursive: true, force: true });
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


  it('preserves commas in ERP_SYNC_ITEM_IDS entries for WebDAV/GVFS-style paths', () => {
    const env = buildErpSyncScriptEnv(
      ['/run/user/1000/gvfs/dav:host=webdav.example,ssl=true/path/IMG_0001.jpg'],
      '/mnt/root/shopbilder-import',
      '/mnt/root/shopbilder'
    );

    expect(env.ERP_SYNC_ITEM_IDS).toBe('/run/user/1000/gvfs/dav:host=webdav.example,ssl=true/path/IMG_0001.jpg');
  });
  it('sets ERP_MEDIA_MIRROR_DIR when mirroring is enabled', () => {
    process.env.ERP_MEDIA_MIRROR_DIR = './media/mirror';

    const env = buildErpSyncScriptEnv(['/mnt/media/a.jpg', '/mnt/media/b.png'], '/mnt/root/shopbilder-import', '/mnt/root/shopbilder');

    expect(env.ERP_MEDIA_MIRROR_DIR).toBe('/mnt/root/shopbilder-import');
    expect(env.ERP_MEDIA_SOURCE_DIR).toBe('/mnt/root/shopbilder');
    expect(env.ERP_SYNC_ITEM_IDS).toBe('/mnt/media/a.jpg\n/mnt/media/b.png');
  });
});


describe('sync-erp script path resolution and preflight', () => {
  const originalScriptPathOverride = process.env.ERP_SYNC_SCRIPT_PATH;

  afterEach(() => {
    if (originalScriptPathOverride === undefined) {
      delete process.env.ERP_SYNC_SCRIPT_PATH;
    } else {
      process.env.ERP_SYNC_SCRIPT_PATH = originalScriptPathOverride;
    }
  });

  it('resolves backend/scripts/erp-sync.sh as the default script path', () => {
    delete process.env.ERP_SYNC_SCRIPT_PATH;
    const logger = { info: jest.fn() };

    const resolved = resolveErpSyncScriptPath(logger);

    expect(resolved.overridePath).toBeNull();
    expect(resolved.defaultPath).toBe(path.resolve(process.cwd(), 'backend/scripts/erp-sync.sh'));
    expect(resolved.scriptPath).toBe(resolved.defaultPath);
  });

  it('prefers ERP_SYNC_SCRIPT_PATH override when provided', () => {
    process.env.ERP_SYNC_SCRIPT_PATH = 'custom/erp-sync.sh';
    const logger = { info: jest.fn() };

    const resolved = resolveErpSyncScriptPath(logger);

    expect(resolved.overridePath).toBe('custom/erp-sync.sh');
    expect(resolved.scriptPath).toBe(path.resolve(process.cwd(), 'custom/erp-sync.sh'));
  });

  it('returns controlled preflight error when script path is missing', () => {
    const logger = { error: jest.fn() };
    const scriptPath = path.resolve(process.cwd(), 'backend/scripts/does-not-exist.sh');

    const validationError = validateErpSyncScriptPath(scriptPath, logger, {
      cwd: process.cwd(),
      defaultPath: path.resolve(process.cwd(), 'backend/scripts/erp-sync.sh'),
      overridePath: scriptPath
    });

    expect(validationError).toBe('ERP sync script is missing or not accessible.');
    expect(logger.error).toHaveBeenCalledWith('[sync-erp] script_preflight_stat_failed', expect.objectContaining({
      cwd: process.cwd(),
      scriptPath
    }));
  });
});
