import type { IncomingMessage, ServerResponse } from 'http';
import action from '../item-relations';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(url: string, method: string, body?: unknown): IncomingMessage {
  const payload = body !== undefined ? JSON.stringify(body) : '';
  const req: any = { url, method, headers: {} };
  req[Symbol.asyncIterator] = async function* () {
    if (payload) yield payload;
  };
  return req as IncomingMessage;
}

function makeDb(config: {
  existingUUIDs?: string[];
  accessories?: object[];
  devices?: object[];
  runChanges?: number;
  throwOnInsert?: boolean;
} = {}) {
  return {
    prepare: jest.fn((sql: string) => {
      if (sql.includes('SELECT ItemUUID FROM items WHERE ItemUUID = ?')) {
        return {
          get: jest.fn((uuid: string) =>
            config.existingUUIDs?.includes(uuid) ? { ItemUUID: uuid } : null
          )
        };
      }
      if (sql.includes('WHERE ir.ParentItemUUID = ?')) {
        return { all: jest.fn(() => config.accessories ?? []) };
      }
      if (sql.includes('WHERE ir.ChildItemUUID = ?')) {
        return { all: jest.fn(() => config.devices ?? []) };
      }
      if (sql.includes('INSERT INTO item_relations ')) {
        return {
          run: jest.fn(() => {
            if (config.throwOnInsert) throw new Error('UNIQUE constraint failed');
          })
        };
      }
      if (sql.includes('UPDATE item_relations')) {
        return { run: jest.fn(() => ({ changes: config.runChanges ?? 1 })) };
      }
      if (sql.includes('DELETE FROM item_relations WHERE ParentItemUUID')) {
        return { run: jest.fn(() => ({ changes: config.runChanges ?? 1 })) };
      }
      // ref-level queries
      if (sql.includes('INSERT INTO item_ref_relations')) {
        return {
          run: jest.fn(() => {
            if (config.throwOnInsert) throw new Error('UNIQUE constraint failed');
          })
        };
      }
      if (sql.includes('DELETE FROM item_ref_relations')) {
        return { run: jest.fn(() => ({ changes: config.runChanges ?? 1 })) };
      }
      // ref-level GET queries (two SELECT queries on item_ref_relations)
      return { get: jest.fn(), all: jest.fn(() => []), run: jest.fn(() => ({ changes: 1 })) };
    })
  };
}

describe('item-relations action', () => {
  describe('matches()', () => {
    it('matches instance-level routes', () => {
      expect(action.matches('/api/item/uuid/relations', 'GET')).toBe(true);
      expect(action.matches('/api/item/uuid/relations', 'POST')).toBe(true);
      expect(action.matches('/api/item/uuid/relations/child-uuid', 'PATCH')).toBe(true);
      expect(action.matches('/api/item/uuid/relations/child-uuid', 'DELETE')).toBe(true);
    });

    it('matches ref-level routes', () => {
      expect(action.matches('/api/ref/ART-1/relations', 'GET')).toBe(true);
      expect(action.matches('/api/ref/ART-1/relations', 'POST')).toBe(true);
      expect(action.matches('/api/ref/ART-1/relations/ART-2', 'DELETE')).toBe(true);
    });

    it('does not match unrelated routes', () => {
      expect(action.matches('/api/items/uuid', 'GET')).toBe(false);
      expect(action.matches('/api/item/uuid/attachments', 'GET')).toBe(false);
    });
  });

  describe('Instance GET', () => {
    it('returns connected accessories and devices', async () => {
      const accessories = [{ Id: 1, ItemUUID: 'child-1', RelationType: 'Zubehör' }];
      const devices = [{ Id: 2, ItemUUID: 'parent-1', RelationType: 'Zubehör' }];
      const ctx = { db: makeDb({ accessories, devices }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().connectedAccessories).toHaveLength(1);
      expect(getBody().connectedToDevices).toHaveLength(1);
    });

    it('returns empty arrays when no relations exist', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().connectedAccessories).toEqual([]);
      expect(getBody().connectedToDevices).toEqual([]);
    });
  });

  describe('Instance POST (link accessory)', () => {
    it('logs AccessoryLinked and returns 201 on success', async () => {
      const ctx = {
        db: makeDb({ existingUUIDs: ['parent-uuid', 'child-uuid'] }),
        logEvent: jest.fn()
      };
      const req = makeRequest('/api/item/parent-uuid/relations', 'POST', {
        childItemUUID: 'child-uuid',
        relationType: 'Zubehör'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(201);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        EntityType: 'Item',
        EntityId: 'parent-uuid',
        Event: 'AccessoryLinked'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.childItemUUID).toBe('child-uuid');
      expect(meta.relationType).toBe('Zubehör');
    });

    it('defaults relationType to Zubehör when not specified', async () => {
      const ctx = {
        db: makeDb({ existingUUIDs: ['parent-uuid', 'child-uuid'] }),
        logEvent: jest.fn()
      };
      const req = makeRequest('/api/item/parent-uuid/relations', 'POST', {
        childItemUUID: 'child-uuid'
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.relationType).toBe('Zubehör');
    });

    it('returns 400 when childItemUUID is missing', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations', 'POST', {});
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when linking item to itself', async () => {
      const ctx = { db: makeDb({ existingUUIDs: ['same-uuid'] }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/same-uuid/relations', 'POST', {
        childItemUUID: 'same-uuid'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toBe('cannot link item to itself');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when parent item does not exist', async () => {
      const ctx = { db: makeDb({ existingUUIDs: ['child-uuid'] }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/missing-parent/relations', 'POST', {
        childItemUUID: 'child-uuid'
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when child item does not exist', async () => {
      const ctx = { db: makeDb({ existingUUIDs: ['parent-uuid'] }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations', 'POST', {
        childItemUUID: 'missing-child'
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('returns 409 when relation already exists', async () => {
      const ctx = {
        db: makeDb({ existingUUIDs: ['parent-uuid', 'child-uuid'], throwOnInsert: true }),
        logEvent: jest.fn()
      };
      const req = makeRequest('/api/item/parent-uuid/relations', 'POST', {
        childItemUUID: 'child-uuid'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(409);
      expect(getBody().error).toBe('relation already exists');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('Instance PATCH (update relation)', () => {
    it('logs AccessoryRelationUpdated and returns 200 on success', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations/child-uuid', 'PATCH', {
        notes: 'Belongs together'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        EntityType: 'Item',
        EntityId: 'parent-uuid',
        Event: 'AccessoryRelationUpdated'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.childItemUUID).toBe('child-uuid');
    });

    it('returns 404 when relation does not exist', async () => {
      const ctx = { db: makeDb({ runChanges: 0 }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations/child-uuid', 'PATCH', {
        notes: 'Note'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toBe('relation not found');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('Instance DELETE (unlink accessory)', () => {
    it('logs AccessoryUnlinked and returns 200 on success', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations/child-uuid', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).toHaveBeenCalledWith(expect.objectContaining({
        EntityType: 'Item',
        EntityId: 'parent-uuid',
        Event: 'AccessoryUnlinked'
      }));
      const meta = JSON.parse(ctx.logEvent.mock.calls[0][0].Meta);
      expect(meta.childItemUUID).toBe('child-uuid');
    });

    it('returns 404 when relation does not exist', async () => {
      const ctx = { db: makeDb({ runChanges: 0 }), logEvent: jest.fn() };
      const req = makeRequest('/api/item/parent-uuid/relations/child-uuid', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
      expect(getBody().error).toBe('relation not found');
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('Ref-level routes (no event logging)', () => {
    it('GET /api/ref/:artikelNr/relations returns compatible refs', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/ref/ART-1/relations', 'GET');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody()).toHaveProperty('compatibleAccessoryRefs');
      expect(getBody()).toHaveProperty('compatibleParentRefs');
    });

    it('POST /api/ref/:artikelNr/relations creates ref relation without logging event', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/ref/ART-1/relations', 'POST', {
        childArtikelNummer: 'ART-2'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(201);
      expect(getBody().ok).toBe(true);
      // ref-level POST intentionally does not emit an event log
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('POST /api/ref/:artikelNr/relations returns 409 on duplicate', async () => {
      const ctx = { db: makeDb({ throwOnInsert: true }), logEvent: jest.fn() };
      const req = makeRequest('/api/ref/ART-1/relations', 'POST', {
        childArtikelNummer: 'ART-2'
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(409);
      expect(getBody().error).toBe('relation already exists');
    });

    it('DELETE /api/ref/:artikelNr/relations/:childNr removes ref relation without logging event', async () => {
      const ctx = { db: makeDb({}), logEvent: jest.fn() };
      const req = makeRequest('/api/ref/ART-1/relations/ART-2', 'DELETE');
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(ctx.logEvent).not.toHaveBeenCalled();
    });

    it('DELETE /api/ref/:artikelNr/relations/:childNr returns 404 when relation not found', async () => {
      const ctx = { db: makeDb({ runChanges: 0 }), logEvent: jest.fn() };
      const req = makeRequest('/api/ref/ART-1/relations/ART-2', 'DELETE');
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });
  });
});
