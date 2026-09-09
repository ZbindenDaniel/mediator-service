import taxonomyAction from '../taxonomy';
import { itemCategories } from '../../../models/item-categories';

function mockRes() {
  const res: any = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code: number, headers: Record<string, string>) => { res.statusCode = code; res.headers = headers; };
  res.end = (body: string) => { res.body = body; };
  return res;
}

describe('GET /api/taxonomy action', () => {
  it('matches only the GET route', () => {
    expect(taxonomyAction.matches('/api/taxonomy', 'GET')).toBe(true);
    expect(taxonomyAction.matches('/api/taxonomy', 'POST')).toBe(false);
    expect(taxonomyAction.matches('/api/other', 'GET')).toBe(false);
  });

  it('returns the loaded taxonomy as JSON', async () => {
    const res = mockRes();
    await taxonomyAction.handle({} as any, res as any, {} as any);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(res.body);
    expect(Array.isArray(parsed.categories)).toBe(true);
    expect(parsed.categories.length).toBe(itemCategories.length);
    const laptop = parsed.categories.find((c: any) => c.code === 20)?.subcategories.find((s: any) => s.code === 201);
    expect(laptop.labelExternal).toBe('Laptop');
    expect(laptop.intakeEnabled).toBe(true);
  });
});
