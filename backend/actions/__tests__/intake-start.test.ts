import type { IncomingMessage, ServerResponse } from 'http';

// intake-start resolves the questionnaire against the REAL contracts (general + 201 quality +
// 201 assembly) so this exercises the actual auto-fill logic. Only the DB and auth are mocked.
jest.mock('../../utils/intake-auth', () => ({
  requireIntakeAuth: jest.fn(() => true),
}));

// The serial lookup returns an existing 201 item with no quality assessment yet, so /start
// takes the `quality` branch and returns qualityQuestions. Ref-candidate query is unused here.
jest.mock('../../db-client', () => ({
  queryOne: jest.fn(async () => ({
    ItemUUID: 'I-100-0001',
    Artikel_Nummer: '100',
    SerialNumber: 'SN1',
    MacAddress: null,
    Quality: null,
    QualityId: null,
    Hersteller: 'HP',
    Kurzbeschreibung: 'EliteBook',
    Hauptkategorien_A: 2,
    Unterkategorien_A: 201,
  })),
  query: jest.fn(async () => []),
}));

import action from '../intake-start';

function createMockResponse() {
  let statusCode: number | undefined;
  let body: any;
  const res = {
    writeHead: jest.fn((status: number) => { statusCode = status; return res; }),
    end: jest.fn((payload?: any) => { body = payload ? JSON.parse(payload) : undefined; })
  } as any;
  return { res: res as ServerResponse, getStatus: () => statusCode, getBody: () => body };
}

function makeRequest(body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const req: any = { url: '/api/intake/start', method: 'POST', headers: {} };
  req[Symbol.asyncIterator] = async function* () { yield payload; };
  return req as IncomingMessage;
}

function questionIds(body: any): string[] {
  return (body.qualityQuestions ?? []).map((q: any) => q.id);
}

describe('intake-start action — drive question auto-resolution', () => {
  it('drops the storage/drive-type questions when the drive is reported via components[]', async () => {
    const req = makeRequest({
      serial: 'SN1',
      // Drive info in the canonical components[] shape (not the disks[] shorthand).
      components: [{ kind: 'disk', sizeGb: 256, type: 'nvme' }],
    });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res);

    expect(getStatus()).toBe(200);
    expect(getBody().nextStep).toBe('quality');
    const ids = questionIds(getBody());
    expect(ids).not.toContain('storage_gb');
    expect(ids).not.toContain('drive_type');
  });

  it('still asks the drive questions when the scan carries no drive data', async () => {
    const req = makeRequest({ serial: 'SN1' });
    const { res, getStatus, getBody } = createMockResponse();

    await action.handle(req, res);

    expect(getStatus()).toBe(200);
    const ids = questionIds(getBody());
    // Sanity: proves the suppression above is driven by the scan, and contracts actually loaded.
    expect(ids).toContain('storage_gb');
    expect(ids).toContain('drive_type');
  });
});
