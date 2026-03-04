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


  it('collects media assets from sandboxed media directory', () => {
    const folder = path.join(sandbox.distMediaDir, 'ART-1');
    const filename = 'ART-1-1.jpg';
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, filename), 'fixture');

    const assets = collectMediaAssets('ITEM-1', filename, 'ART-1');

    expect(assets).toContain('/media/ART-1/ART-1-1.jpg');
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
