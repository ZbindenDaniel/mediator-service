import type { IncomingMessage, ServerResponse } from 'http';
import { ItemEinheit } from '../../../models';
import action, { normaliseMediaReference } from '../save-item';

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


describe('normaliseMediaReference', () => {
  const itemId = 'ITEM-1';
  const artikelNummer = '4735';


  it('keeps single artikel-prefixed relative path when already prefixed', () => {
    const existsSpy = jest
      .spyOn(require('fs'), 'existsSync')
      .mockImplementation((candidate: string) => String(candidate).endsWith('004735/file.jpg'));

    const result = normaliseMediaReference(itemId, artikelNummer, '004735/file.jpg');

    expect(result).toBe('/media/004735/file.jpg');
    existsSpy.mockRestore();
  });

  it('prepends media folder for bare filenames', () => {
    const existsSpy = jest
      .spyOn(require('fs'), 'existsSync')
      .mockImplementation((candidate: string) => String(candidate).endsWith('004735/file.jpg'));

    const result = normaliseMediaReference(itemId, artikelNummer, 'file.jpg');

    expect(result).toBe('/media/004735/file.jpg');
    existsSpy.mockRestore();
  });

  it('keeps /media-prefixed paths unchanged', () => {
    const existsSpy = jest
      .spyOn(require('fs'), 'existsSync')
      .mockImplementation((candidate: string) => String(candidate).endsWith('004735/file.jpg'));

    const result = normaliseMediaReference(itemId, artikelNummer, '/media/004735/file.jpg');

    expect(result).toBe('/media/004735/file.jpg');
    existsSpy.mockRestore();
  });

  it('falls back without doubled folder prefixes when file is missing', () => {
    const existsSpy = jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false);

    const result = normaliseMediaReference(itemId, artikelNummer, '004735/file.jpg');

    expect(result).toBe('/media/004735/file.jpg');
    existsSpy.mockRestore();
  });
});
