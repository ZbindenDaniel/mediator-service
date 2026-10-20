import type { IncomingMessage, ServerResponse } from 'http';

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn({})),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

jest.mock('../../db', () => ({
  insertQualityAssessment: jest.fn(async () => 42),
  updateItemQualityAssessment: jest.fn(async () => undefined),
  generateShopwareCorrelationId: jest.fn(() => 'corr-remove-123'),
}));

// The score is derived data with its own tests; here only the slot subcategory (R5 guard) matters.
jest.mock('../../lib/quality-score', () => ({
  resolveEffectiveSubCategory: jest.fn(async () => null),
  recomputeQualityScoreSafely: jest.fn(async () => undefined),
}));

import action from '../remove-from-device';
import * as qualityScore from '../../lib/quality-score';
import * as dbClient from '../../db-client';
import * as db from '../../db';

const mockQueryOne = dbClient.queryOne as jest.Mock;
const mockExecute = dbClient.execute as jest.Mock;
const mockInsertQA = db.insertQualityAssessment as jest.Mock;
const mockUpdateQA = db.updateItemQualityAssessment as jest.Mock;

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

// A legacy spare part always carries a reference, so it takes the relocate-only path.
const sparePartItem = { ItemUUID: 'FAN-001', Artikel_Nummer: 'ART-FAN', BoxID: null };
const destBox = { BoxID: 'B-042', LocationId: 'S-01', Location: 'Regal 1' };

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    getItem: jest.fn(async () => sparePartItem),
    getBox: jest.fn(async () => destBox),
    logEvent: jest.fn(async () => undefined),
    enqueueShopwareSyncJob: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockQueryOne.mockReset();
  mockExecute.mockReset();
  mockInsertQA.mockReset();
  mockUpdateQA.mockReset();
  mockQueryOne.mockResolvedValue({ ParentItemUUID: 'P-001' });
  mockExecute.mockResolvedValue(1);
  mockInsertQA.mockResolvedValue(42);
  mockUpdateQA.mockResolvedValue(undefined);
});

describe('remove-from-device action', () => {
  describe('matches()', () => {
    it('matches POST /remove-from-device', () => {
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'POST')).toBe(true);
    });
    it('does not match GET or other methods', () => {
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'GET')).toBe(false);
      expect(action.matches('/api/items/some-uuid/remove-from-device', 'DELETE')).toBe(false);
    });
    it('does not match unrelated paths', () => {
      expect(action.matches('/api/items/some-uuid/spare-parts', 'POST')).toBe(false);
    });
  });

  describe('POST /remove-from-device', () => {
    it('relocates item and returns 200 with toBoxId and locationId', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
      expect(getBody().toBoxId).toBe('B-042');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE items'),
        expect.arrayContaining(['B-042', 'FAN-001'])
      );
    });

    it('logs RemovedFromDevice on the spare part', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const removedEvent = ctx.logEvent.mock.calls.find(
        (c: any[]) => c[0].Event === 'RemovedFromDevice'
      );
      expect(removedEvent).toBeDefined();
      expect(removedEvent[0].EntityId).toBe('FAN-001');
      const meta = JSON.parse(removedEvent[0].Meta);
      expect(meta.parentUuid).toBe('P-001');
      expect(meta.toBoxId).toBe('B-042');
    });

    it('logs SparePartRemoved on the parent device', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      const parentEvent = ctx.logEvent.mock.calls.find(
        (c: any[]) => c[0].Event === 'SparePartRemoved'
      );
      expect(parentEvent).toBeDefined();
      expect(parentEvent[0].EntityId).toBe('P-001');
      const meta = JSON.parse(parentEvent[0].Meta);
      expect(meta.childItemUUID).toBe('FAN-001');
    });

    it('marks parent device as Ersatzteil (manual grade 1) when the slot is unweighted', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      // Grade 1 is now a manual override, so the parent's previous answers are no longer wiped.
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('"QualityManual" = TRUE'),
        ['P-001']
      );
      expect(mockInsertQA).not.toHaveBeenCalledWith(expect.objectContaining({ notes: 'Ersatzteil entnommen' }));
    });

    it('enqueues Shopware sync for parent device', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(ctx.enqueueShopwareSyncJob).toHaveBeenCalledWith(expect.objectContaining({
        JobType: 'item-upsert',
      }));
    });

    it('returns 404 when item not found', async () => {
      const ctx = makeCtx({ getItem: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/MISSING/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });

    it('returns 400 when actor is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', { toBoxId: 'B-042' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
    });

    it('returns 400 when toBoxId is missing', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', { actor: 'alice' });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
    });

    it('returns 400 when item has no Zerlegt_aus relation', async () => {
      mockQueryOne.mockResolvedValue(null);
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toMatch(/Ersatzteil/);
    });

    it('returns 404 when destination box not found', async () => {
      const ctx = makeCtx({ getBox: jest.fn().mockResolvedValue(null) });
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-MISSING',
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(404);
    });

    it('still succeeds when quality assessment insertion fails', async () => {
      mockInsertQA.mockRejectedValue(new Error('DB error'));
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      // QA failure is non-fatal: item is still relocated
      expect(getStatus()).toBe(200);
      expect(getBody().ok).toBe(true);
    });

    it('does NOT mark the parent when markParentAsSpare is false (contract: sold whole)', async () => {
      const ctx = makeCtx();
      const req = makeRequest('/api/items/FAN-001/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
        markParentAsSpare: false,
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(mockInsertQA).not.toHaveBeenCalled();
      expect(mockUpdateQA).not.toHaveBeenCalled();
      expect(ctx.enqueueShopwareSyncJob).not.toHaveBeenCalled();
    });
  });

  describe('graduation of an in-device component (no reference yet)', () => {
    const mockWithTransaction = dbClient.withTransaction as jest.Mock;
    const component = { ItemUUID: 'C-comp1', Artikel_Nummer: null, BoxID: null };

    function makeGraduationClient() {
      return {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('SELECT "Artikel_Nummer" FROM items')) return { rows: [{ Artikel_Nummer: null }], rowCount: 1 };
          if (sql.includes('ParentArtikelNummer')) return { rows: [{ ParentArtikelNummer: '000010' }], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        }),
      };
    }

    function makeGradCtx(overrides: Record<string, any> = {}) {
      return makeCtx({
        getItem: jest.fn(async (id: string) => (id === 'C-comp1' ? component : null)),
        getMaxArtikelNummer: jest.fn(async () => '000041'),
        ...overrides,
      });
    }

    beforeEach(() => {
      mockWithTransaction.mockImplementation(async (fn: any) => fn(makeGraduationClient()));
    });
    afterEach(() => {
      mockWithTransaction.mockImplementation(async (fn: any) => fn({}));
    });

    it('sets identity and keeps the component\'s ItemUUID', async () => {
      const ctx = makeGradCtx();
      const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
        artikelNummer: '000042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      expect(getBody().itemUUID).toBe('C-comp1');
      const gradEvent = ctx.logEvent.mock.calls.find((c: any[]) => c[0].Event === 'ComponentGraduated');
      expect(gradEvent).toBeDefined();
      expect(gradEvent[0].EntityId).toBe('C-comp1');
      expect(JSON.parse(gradEvent[0].Meta).artikelNummer).toBe('000042');
    });

    it('rejects graduation without an artikelNummer or newRef', async () => {
      const ctx = makeGradCtx();
      const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
      });
      const { res, getStatus, getBody } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(400);
      expect(getBody().error).toMatch(/identity/i);
    });

    it('creates a new reference from newRef when no artikelNummer is given', async () => {
      const ctx = makeGradCtx();
      const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', {
        actor: 'alice',
        toBoxId: 'B-042',
        newRef: { Artikelbeschreibung: 'Samsung SSD 256GB', Hersteller: 'Samsung', Unterkategorien_A: 301 },
      });
      const { res, getStatus } = createMockResponse();

      await action.handle(req, res, ctx);

      expect(getStatus()).toBe(200);
      // Next Artikelnummer after 000041 is 000042 (zero-padded to 6).
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO item_refs'),
        expect.arrayContaining(['000042', 'Samsung SSD 256GB'])
      );
    });

    describe('subcategory guard (R5)', () => {
      const mockResolveSub = qualityScore.resolveEffectiveSubCategory as jest.Mock;
      beforeEach(() => {
        // The component sits in a webcam slot (target 2109); the chosen ref is a drive (901).
        mockResolveSub.mockImplementation(async (id: string) => (id === 'C-comp1' ? 2109 : null));
        mockQueryOne.mockImplementation(async (sql: string) =>
          sql.includes('FROM item_refs') ? { Artikel_Nummer: '000042', Unterkategorien_A: '901' } : { ParentItemUUID: 'P-001' });
      });
      afterEach(() => { mockResolveSub.mockImplementation(async () => null); });

      it('refuses a ref of another subcategory than the slot with 409', async () => {
        const ctx = makeGradCtx();
        const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', { actor: 'alice', toBoxId: 'B-042', artikelNummer: '000042' });
        const { res, getStatus, getBody } = createMockResponse();
        await action.handle(req, res, ctx);
        expect(getStatus()).toBe(409);
        expect(getBody()).toMatchObject({ slotSubCategory: 2109, refSubCategory: 901 });
      });

      it('accepts it with confirmSubCategoryChange', async () => {
        const ctx = makeGradCtx();
        const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', {
          actor: 'alice', toBoxId: 'B-042', artikelNummer: '000042', confirmSubCategoryChange: true
        });
        const { res, getStatus } = createMockResponse();
        await action.handle(req, res, ctx);
        expect(getStatus()).toBe(200);
      });

      it('prefills a new ref with the slot subcategory', async () => {
        const ctx = makeGradCtx();
        const req = makeRequest('/api/items/C-comp1/remove-from-device', 'POST', {
          actor: 'alice', toBoxId: 'B-042', newRef: { Artikelbeschreibung: 'Lenovo 720p Webcam' }
        });
        const { res, getStatus } = createMockResponse();
        await action.handle(req, res, ctx);
        expect(getStatus()).toBe(200);
        expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO item_refs'), expect.arrayContaining(['Lenovo 720p Webcam', 2109]));
      });
    });
  });
});
