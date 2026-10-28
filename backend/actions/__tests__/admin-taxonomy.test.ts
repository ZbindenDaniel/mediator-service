// Tests the admin-taxonomy action's routing/validation/orchestration by mocking ../db (the SQL is
// exercised by the Postgres-gated suites) and the cache reload.
jest.mock('../../db', () => ({
  readTaxonomyFromDb: jest.fn(),
  taxonomyCategoryExists: jest.fn(),
  taxonomySubcategoryExists: jest.fn(),
  insertTaxonomyCategory: jest.fn(),
  insertTaxonomySubcategory: jest.fn(),
  updateTaxonomyCategory: jest.fn(),
  updateTaxonomySubcategory: jest.fn()
}));
jest.mock('../../lib/taxonomy', () => ({ reloadTaxonomyFromDb: jest.fn().mockResolvedValue([]) }));

import { Readable } from 'stream';
import adminTaxonomy from '../admin-taxonomy';
import * as db from '../../db';
import { reloadTaxonomyFromDb } from '../../lib/taxonomy';

const mockDb = db as jest.Mocked<typeof db>;
const mockReload = reloadTaxonomyFromDb as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code: number, headers: Record<string, string>) => { res.statusCode = code; res.headers = headers; };
  res.end = (body: string) => { res.body = body; };
  return res;
}
function mockReq(method: string, url: string, body?: string): any {
  const req: any = body !== undefined ? Readable.from([Buffer.from(body)]) : new Readable({ read() { this.push(null); } });
  req.method = method; req.url = url; req.headers = {};
  return req;
}
async function call(method: string, url: string, body?: unknown) {
  const res = mockRes();
  await adminTaxonomy.handle(mockReq(method, url, body === undefined ? undefined : JSON.stringify(body)), res, {} as any);
  return res;
}

describe('admin-taxonomy CRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.taxonomyCategoryExists.mockResolvedValue(false);
    mockDb.taxonomySubcategoryExists.mockResolvedValue(false);
    mockDb.updateTaxonomyCategory.mockResolvedValue(1);
    mockDb.updateTaxonomySubcategory.mockResolvedValue(1);
    mockDb.readTaxonomyFromDb.mockResolvedValue([{ code: 10, label: 'C', labelExternal: 'C', subcategories: [] }] as any);
  });

  it('GET returns the DB taxonomy', async () => {
    const res = await call('GET', '/api/admin/taxonomy');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).categories[0].code).toBe(10);
  });

  it('POST category inserts, derives labelInternal, and reloads the cache', async () => {
    const res = await call('POST', '/api/admin/taxonomy/categories', { code: 210, labelExternal: 'Neue Kategorie' });
    expect(res.statusCode).toBe(200);
    const arg = mockDb.insertTaxonomyCategory.mock.calls[0][0];
    expect(arg.code).toBe(210);
    expect(arg.labelInternal).toBe('Neue_Kategorie'); // canonicalized from labelExternal
    expect(mockReload).toHaveBeenCalled();
  });

  it('POST category rejects a duplicate code (409, no insert)', async () => {
    mockDb.taxonomyCategoryExists.mockResolvedValue(true);
    const res = await call('POST', '/api/admin/taxonomy/categories', { code: 10, labelExternal: 'Dup' });
    expect(res.statusCode).toBe(409);
    expect(mockDb.insertTaxonomyCategory).not.toHaveBeenCalled();
  });

  it('POST category requires labelExternal (400)', async () => {
    const res = await call('POST', '/api/admin/taxonomy/categories', { code: 210 });
    expect(res.statusCode).toBe(400);
  });

  it('POST subcategory rejects a missing parent (400)', async () => {
    mockDb.taxonomyCategoryExists.mockResolvedValue(false);
    const res = await call('POST', '/api/admin/taxonomy/subcategories', { code: 2101, parentCode: 210, labelExternal: 'X' });
    expect(res.statusCode).toBe(400);
    expect(mockDb.insertTaxonomySubcategory).not.toHaveBeenCalled();
  });

  it('POST subcategory inserts under an existing parent', async () => {
    mockDb.taxonomyCategoryExists.mockResolvedValue(true);
    const res = await call('POST', '/api/admin/taxonomy/subcategories', { code: 2101, parentCode: 210, labelExternal: 'X' });
    expect(res.statusCode).toBe(200);
    expect(mockDb.insertTaxonomySubcategory).toHaveBeenCalled();
  });

  it('PUT category updates provided fields; 404 when not found', async () => {
    const ok = await call('PUT', '/api/admin/taxonomy/categories/10', { labelExternal: 'Renamed', active: false });
    expect(ok.statusCode).toBe(200);
    expect(mockDb.updateTaxonomyCategory).toHaveBeenCalledWith(10, expect.objectContaining({ labelExternal: 'Renamed', active: false }));

    mockDb.updateTaxonomyCategory.mockResolvedValue(0);
    const missing = await call('PUT', '/api/admin/taxonomy/categories/999', { labelExternal: 'x' });
    expect(missing.statusCode).toBe(404);
  });
});
