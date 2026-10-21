import type { IncomingMessage, ServerResponse } from 'http';

// One stored assessment per item, shared by the db mocks so a PATCH followed by a POST sees each other.
const store = {
  qualityId: null as number | null,
  responses: {} as Record<string, string>,
  nextId: 10,
};

jest.mock('../../db', () => ({
  getItemQualityResponses: jest.fn(async () => ({ responses: { ...store.responses }, notes: null })),
  insertQualityAssessment: jest.fn(async (a: any) => { store.responses = { ...a.checkResponse.answers }; return store.nextId++; }),
  updateItemQualityAssessment: jest.fn(async (_uuid: string, id: number) => { store.qualityId = id; }),
  updateQualityAssessmentAnswers: jest.fn(async (_id: number, _tag: string, _v: number, cr: any) => { store.responses = { ...cr.answers }; }),
  updateItemInstanceSpecs: jest.fn(async () => undefined),
}));
jest.mock('../../db-client', () => ({
  queryOne: jest.fn(async (sql: string) => (sql.includes('"QualityId"') ? { QualityId: store.qualityId } : null)),
}));
jest.mock('../../lib/quality-contracts', () => ({
  loadGeneralContract: jest.fn(() => ({ version: 1, questions: [] })),
  loadSubCategoryContract: jest.fn(() => null),
  buildQualityCheckResponse: jest.fn((_g: any, _s: any, answers: Record<string, string>) => ({
    answers, derivedSpecs: {}, qualityValue: 4, qualityTag: 'Gut', generalContractVersion: 1,
  })),
}));
jest.mock('../../contracts/registry', () => ({
  getAssemblyContract: jest.fn(() => ({
    version: 1,
    subCategory: 201,
    parts: [
      { key: 'battery', label: 'Akku', targetSubcategory: 2132, weight: 5, question: { id: 'part_battery', type: 'select', question: '?', values: ['Vorhanden', 'Nicht vorhanden'] } },
      { key: 'storage', label: 'SSD', targetSubcategory: 901, question: { id: 'storage_gb', type: 'select', question: '?', values: ['256'] }, specQuestion: { id: 'drive_type', type: 'select', question: '?', values: ['SSD'] } },
    ],
  })),
}));
jest.mock('../../lib/quality-score', () => ({
  resolveEffectiveSubCategory: jest.fn(async () => 201),
  recomputeQualityScoreSafely: jest.fn(async () => undefined),
}));
jest.mock('../../utils/write-guard', () => ({ guardWrite: jest.fn(async () => true) }));

import action from '../quality-review';
import * as db from '../../db';

function request(url: string, method: string, body?: unknown): IncomingMessage {
  const payload = body !== undefined ? JSON.stringify(body) : '';
  const req: any = { url, method, headers: {} };
  req[Symbol.asyncIterator] = async function* () { if (payload) yield payload; };
  return req as IncomingMessage;
}

function response() {
  let status: number | undefined;
  let body: any;
  const res: any = {
    writeHead: jest.fn((s: number) => { status = s; return res; }),
    end: jest.fn((p?: string) => { body = p ? JSON.parse(p) : undefined; }),
  };
  return { res: res as ServerResponse, status: () => status, body: () => body };
}

const ctx = { getItem: jest.fn(async () => ({ ItemUUID: 'I-1-0001' })), logEvent: jest.fn(async () => undefined) };

async function call(method: string, url: string, body: unknown) {
  const r = response();
  await action.handle(request(url, method, body), r.res, ctx);
  return r;
}

const patchUrl = '/api/items/I-1-0001/quality-review/answers';
const postUrl = '/api/items/I-1-0001/quality-review';

beforeEach(() => {
  store.qualityId = null;
  store.responses = {};
  jest.clearAllMocks();
});

describe('quality-review: slot answers and full assessment never overwrite each other', () => {
  it('matches the PATCH answers route', () => {
    expect(action.matches(patchUrl, 'PATCH')).toBe(true);
    expect(action.matches(patchUrl, 'POST')).toBe(false);
  });

  it('PATCH creates a first assessment, then merges in place without a new history row', async () => {
    expect((await call('PATCH', patchUrl, { reviewed_by: 'ana', answers: { part_battery: 'Vorhanden' } })).status()).toBe(200);
    expect(db.insertQualityAssessment).toHaveBeenCalledTimes(1);
    expect(store.qualityId).toBe(10);

    const second = await call('PATCH', patchUrl, { reviewed_by: 'ana', answers: { storage_gb: '256' } });
    expect(second.status()).toBe(200);
    expect(db.insertQualityAssessment).toHaveBeenCalledTimes(1);
    expect(db.updateQualityAssessmentAnswers).toHaveBeenCalledTimes(1);
    expect(store.responses).toEqual({ part_battery: 'Vorhanden', storage_gb: '256' });
  });

  it('PATCH clears an answer with an empty value', async () => {
    store.qualityId = 3;
    store.responses = { part_battery: 'Vorhanden', keyboard: 'Gut' };
    await call('PATCH', patchUrl, { reviewed_by: 'ana', answers: { part_battery: '' } });
    expect(store.responses).toEqual({ keyboard: 'Gut' });
  });

  it('PATCH refuses questions that are not slot questions of the item', async () => {
    const r = await call('PATCH', patchUrl, { reviewed_by: 'ana', answers: { keyboard: 'Gut', part_battery: 'Vorhanden' } });
    expect(r.status()).toBe(400);
    expect(r.body().error).toMatch(/keyboard/);
    expect(db.updateQualityAssessmentAnswers).not.toHaveBeenCalled();
    expect(db.insertQualityAssessment).not.toHaveBeenCalled();
  });

  it('a chip clicked while the form was open survives the form save', async () => {
    store.qualityId = 3;
    store.responses = { keyboard: 'Abgenutzt' };
    await call('PATCH', patchUrl, { reviewed_by: 'ana', answers: { part_battery: 'Nicht vorhanden', drive_type: 'SSD' } });

    // The form only sends the item's own questions.
    const saved = await call('POST', postUrl, { reviewed_by: 'ana', answers: { keyboard: 'Gut' } });
    expect(saved.status()).toBe(200);
    expect(store.responses).toEqual({ keyboard: 'Gut', part_battery: 'Nicht vorhanden', drive_type: 'SSD' });
  });

  it('POST keeps replacing the own questions, and a slot answer it does send wins', async () => {
    store.qualityId = 3;
    store.responses = { keyboard: 'Abgenutzt', scratches: 'Viele', part_battery: 'Vorhanden' };
    await call('POST', postUrl, { reviewed_by: 'ana', answers: { keyboard: 'Gut', part_battery: 'Nicht vorhanden' } });
    expect(store.responses).toEqual({ keyboard: 'Gut', part_battery: 'Nicht vorhanden' });
  });
});
