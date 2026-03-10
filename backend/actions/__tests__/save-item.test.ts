import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { ItemEinheit } from '../../../models';
import { createFsSandbox, type FsSandbox } from '../../test-utils/fs-sandbox';

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

function createRequest(url: string): IncomingMessage {
  return { url, method: 'GET' } as IncomingMessage;
}

function createPutRequest(url: string, body: Record<string, unknown>): IncomingMessage {
  const payload = JSON.stringify(body);
  return {
    url,
    method: 'PUT',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
    }
  } as IncomingMessage;
}

describe('save-item action', () => {
  let sandbox: FsSandbox;
  let action: typeof import('../save-item').default;
  let collectMediaAssets: typeof import('../save-item').collectMediaAssets;

  beforeAll(() => {
    sandbox = createFsSandbox('save-item-action-');
    const mod = sandbox.importFresh<typeof import('../save-item')>('../save-item', __dirname);
    action = mod.default;
    collectMediaAssets = mod.collectMediaAssets;
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('matches save item routes', () => {
    expect(action.matches('/api/items/ITEM-1', 'GET')).toBe(true);
  });

  it('returns item detail payloads for GET requests', async () => {
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-1',
          Artikel_Nummer: 'ART-1',
          BoxID: 'BOX-1',
          Einheit: ItemEinheit.Stk,
          Quality: 1,
          Grafikname: ''
        }))
      },
      getBox: {
        get: jest.fn(() => ({ BoxID: 'BOX-1', Label: 'Box 1' }))
      },
      listEventsForItem: {
        all: jest.fn(() => [])
      },
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-1' }))
      }
    };

    const req = createRequest('/api/items/ITEM-1');
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.item).toEqual(expect.objectContaining({ ItemUUID: 'ITEM-1', Artikel_Nummer: 'ART-1' }));
    expect(body.reference).toEqual(expect.objectContaining({ Artikel_Nummer: 'ART-1' }));
    expect(Array.isArray(body.media)).toBe(true);
  });

  it('returns representative instance-backed detail for Artikelnummer lookups with instances', async () => {
    const ctx = {
      getItem: {
        get: jest.fn(() => null)
      },
      findByMaterial: {
        all: jest.fn(() => [
          {
            ItemUUID: 'ITEM-2',
            Artikel_Nummer: 'ART-2',
            BoxID: 'BOX-2',
            Location: 'A-01',
            Einheit: ItemEinheit.Stk,
            Quality: 2,
            UpdatedAt: new Date('2024-01-01T00:00:00.000Z')
          }
        ])
      },
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-2', Kurzbeschreibung: 'Reference text' }))
      },
      getBox: {
        get: jest.fn(() => ({ BoxID: 'BOX-2', Label: 'Box 2' }))
      },
      listEventsForItem: {
        all: jest.fn(() => [])
      },
      getAgenticRun: {
        get: jest.fn(() => null)
      }
    };

    const req = createRequest('/api/items/ART-2');
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.item).toEqual(expect.objectContaining({ ItemUUID: 'ITEM-2', Artikel_Nummer: 'ART-2' }));
    expect(body.reference).toEqual(expect.objectContaining({ Artikel_Nummer: 'ART-2' }));
    expect(Array.isArray(body.instances)).toBe(true);
    expect(body.instances.length).toBe(1);
    expect(ctx.listEventsForItem.all).toHaveBeenCalledWith('ITEM-2');
  });

  it('returns reference-backed detail and empty instances for Artikelnummer lookups without instances', async () => {
    const ctx = {
      getItem: {
        get: jest.fn(() => null)
      },
      findByMaterial: {
        all: jest.fn(() => [])
      },
      getItemReference: {
        get: jest.fn(() => ({ Artikel_Nummer: 'ART-3', Kurzbeschreibung: 'Reference only' }))
      },
      getBox: {
        get: jest.fn(() => null)
      },
      listEventsForItem: {
        all: jest.fn(() => [])
      }
    };

    const req = createRequest('/api/items/ART-3');
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    const body = getBody();
    expect(getStatus()).toBe(200);
    expect(body.item).toEqual(
      expect.objectContaining({
        ItemUUID: 'ART-3',
        Artikel_Nummer: 'ART-3',
        BoxID: null,
        Location: null,
        ShelfLabel: null
      })
    );
    expect(body.reference).toEqual(expect.objectContaining({ Artikel_Nummer: 'ART-3' }));
    expect(body.instances).toEqual([]);
    expect(body.events).toEqual([]);
  });


  it('normalizes bare Grafikname values to explicit /media paths', () => {
    const assets = collectMediaAssets('ITEM-EXPLICIT-1', 'ART-EXPLICIT/ART-EXPLICIT-1.jpg', 'ART-EXPLICIT');

    expect(assets).toEqual(expect.arrayContaining(['/media/ART-EXPLICIT/ART-EXPLICIT-1.jpg']));
  });

  it('keeps explicit /media Grafikname paths authoritative without fallback synthesis', () => {
    const folder = path.join(sandbox.distMediaDir, 'ART-10');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'ART-10-1.jpg'), 'fixture');

    const assets = collectMediaAssets('ITEM-10', '/media/ART-10/ART-10-1.jpg', 'ART-10');

    expect(assets[0]).toBe('/media/ART-10/ART-10-1.jpg');
  });


  it('collects media assets from sandboxed media directory', () => {
    const folder = path.join(sandbox.distMediaDir, 'ART-1');
    const filename = 'ART-1-1.jpg';
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, filename), 'fixture');

    const assets = collectMediaAssets('ITEM-1', filename, 'ART-1');

    expect(assets).toContain('/media/ART-1/ART-1-1.jpg');
  });



  it('keeps fallback primary media stable after removing the previous primary asset', async () => {
    const folder = path.join(sandbox.distMediaDir, 'ART-9');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'ART-9-1.jpg'), 'one');
    fs.writeFileSync(path.join(folder, 'ART-9-2.jpg'), 'two');

    const persistItemReference = jest.fn();
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-9',
          Artikel_Nummer: 'ART-9',
          BoxID: null,
          Location: null,
          Grafikname: '/media/ART-9/ART-9-1.jpg',
          Einheit: ItemEinheit.Stk
        }))
      },
      getItemReference: {
        get: jest.fn(() => ({
          Artikel_Nummer: 'ART-9',
          Grafikname: '/media/ART-9/ART-9-1.jpg',
          ImageNames: '/media/ART-9/ART-9-1.jpg|/media/ART-9/ART-9-2.jpg',
          Artikelbeschreibung: 'Reference text'
        }))
      },
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      },
      persistItemReference,
      logEvent: jest.fn(),
      enqueueShopwareSyncJob: jest.fn()
    };

    const req = createPutRequest('/api/items/ITEM-9', {
      actor: 'Tester',
      picture1: null
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ ok: true, media: ['/media/ART-9/ART-9-2.jpg'] });
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'ART-9',
        Grafikname: 'ART-9-2.jpg',
        ImageNames: '/media/ART-9/ART-9-1.jpg|/media/ART-9/ART-9-2.jpg'
      })
    );
  });



  it('persists path-like Grafikname payload values as basename-only filenames', async () => {
    const persistItemReference = jest.fn();
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-UNSAFE',
          Artikel_Nummer: 'ART-UNSAFE',
          BoxID: null,
          Location: null,
          Grafikname: 'ART-UNSAFE-1.jpg',
          Einheit: ItemEinheit.Stk
        }))
      },
      getItemReference: {
        get: jest.fn(() => ({
          Artikel_Nummer: 'ART-UNSAFE',
          Grafikname: 'ART-UNSAFE-1.jpg',
          Artikelbeschreibung: 'Reference text'
        }))
      },
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      },
      persistItemReference,
      logEvent: jest.fn(),
      enqueueShopwareSyncJob: jest.fn()
    };

    const req = createPutRequest('/api/items/ITEM-UNSAFE', {
      actor: 'Tester',
      Grafikname: '/media/ART-UNSAFE/ART-UNSAFE-2.jpg'
    });
    const { res, getStatus } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'ART-UNSAFE',
        Grafikname: 'ART-UNSAFE-2.jpg'
      })
    );
  });


  it('does not mutate legacy persisted Grafikname paths unless explicitly replaced', async () => {
    const persistItemReference = jest.fn();
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-LEGACY',
          Artikel_Nummer: 'ART-LEGACY',
          BoxID: null,
          Location: null,
          Grafikname: '/media/ART-LEGACY/ART-LEGACY-1.jpg',
          Einheit: ItemEinheit.Stk
        }))
      },
      getItemReference: {
        get: jest.fn(() => ({
          Artikel_Nummer: 'ART-LEGACY',
          Grafikname: '/media/ART-LEGACY/ART-LEGACY-1.jpg',
          Artikelbeschreibung: 'Reference text'
        }))
      },
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      },
      persistItemReference,
      logEvent: jest.fn(),
      enqueueShopwareSyncJob: jest.fn()
    };

    const req = createPutRequest('/api/items/ITEM-LEGACY', {
      actor: 'Tester',
      Artikelbeschreibung: 'Updated text'
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ ok: true, media: ['/media/ART-LEGACY/ART-LEGACY-1.jpg'] });
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'ART-LEGACY',
        Grafikname: '/media/ART-LEGACY/ART-LEGACY-1.jpg'
      })
    );
  });


  it('does not prune media directory after removing the final file asset', async () => {
    const folder = path.join(sandbox.distMediaDir, 'ART-10');
    const asset = 'ART-10-1.jpg';
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, asset), 'fixture');

    const persistItemReference = jest.fn();
    const ctx = {
      getItem: {
        get: jest.fn(() => ({
          ItemUUID: 'ITEM-10',
          Artikel_Nummer: 'ART-10',
          BoxID: null,
          Location: null,
          Grafikname: '/media/ART-10/ART-10-1.jpg',
          Einheit: ItemEinheit.Stk
        }))
      },
      getItemReference: {
        get: jest.fn(() => ({
          Artikel_Nummer: 'ART-10',
          Grafikname: '/media/ART-10/ART-10-1.jpg',
          ImageNames: '/media/ART-10/ART-10-1.jpg',
          Artikelbeschreibung: 'Reference text'
        }))
      },
      db: {
        transaction: jest.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args))
      },
      persistItemReference,
      logEvent: jest.fn(),
      enqueueShopwareSyncJob: jest.fn()
    };

    const req = createPutRequest('/api/items/ITEM-10', {
      actor: 'Tester',
      picture1: null
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ ok: true, media: [] });
    expect(fs.existsSync(path.join(folder, asset))).toBe(false);
    expect(fs.existsSync(folder)).toBe(true);
  });

  it('returns 404 when identifier is unknown', async () => {
    const ctx = {
      getItem: {
        get: jest.fn(() => null)
      },
      findByMaterial: {
        all: jest.fn(() => [])
      },
      getItemReference: {
        get: jest.fn(() => null)
      },
      getBox: {
        get: jest.fn(() => null)
      },
      listEventsForItem: {
        all: jest.fn(() => [])
      }
    };

    const req = createRequest('/api/items/UNKNOWN-ID');
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res, ctx);

    expect(getStatus()).toBe(404);
    expect(getBody()).toEqual({ error: 'Not found' });
  });
});
