import intakeAction from '../intake-categories';
import { resetTaxonomyCache } from '../../lib/taxonomy';

// The intake list used to be a hardcoded array; it is now derived from the
// taxonomy's intakeEnabled/intakeSortOrder. This asserts the derived output is
// identical (values and order) so the switch is behavior-preserving.
const EXPECTED = [
  { hauptkategorienA: 20, unterkategorienA: 201, label: 'Laptop' },
  { hauptkategorienA: 10, unterkategorienA: 102, label: 'Desktop-PC' },
  { hauptkategorienA: 10, unterkategorienA: 103, label: 'Server' },
  { hauptkategorienA: 10, unterkategorienA: 109, label: 'All-in-One' },
  { hauptkategorienA: 20, unterkategorienA: 204, label: 'Tablet' }
];

function mockRes() {
  const res: any = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code: number, headers: Record<string, string>) => { res.statusCode = code; res.headers = headers; };
  res.end = (body: string) => { res.body = body; };
  return res;
}

describe('intake categories (derived from taxonomy)', () => {
  beforeEach(() => resetTaxonomyCache());

  it('returns the same list (values + order) as the former hardcoded array', async () => {
    // Intake auth is disabled when no INTAKE_TOKEN is configured.
    const prev = process.env.INTAKE_TOKEN;
    delete process.env.INTAKE_TOKEN;
    try {
      const res = mockRes();
      await intakeAction.handle({ headers: {} } as any, res as any, {} as any);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).categories).toEqual(EXPECTED);
    } finally {
      if (prev !== undefined) process.env.INTAKE_TOKEN = prev;
    }
  });
});
