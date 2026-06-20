import { jest } from '@jest/globals';

// Mock the agentic service so we don't need real DB or LLM connections
jest.mock('../../agentic', () => ({
  startAgenticRun: jest.fn(),
  restartAgenticRun: jest.fn()
}));

import { forwardAgenticTrigger, buildAgenticRunRequestBody, AgenticTriggerValidationError } from '../agentic-trigger';

const agenticModule = jest.requireMock<{
  startAgenticRun: jest.Mock;
  restartAgenticRun: jest.Mock;
}>('../../agentic');

// Minimal service deps — startAgenticRun and restartAgenticRun are mocked at module level
const makeServiceDeps = () => ({
  getAgenticRun: jest.fn(async () => null),
  getItemReference: jest.fn(async () => null),
  upsertAgenticRun: jest.fn(async () => undefined),
  updateAgenticRunStatus: jest.fn(async () => 1),
  logEvent: jest.fn(async () => undefined),
  findByMaterial: jest.fn(async () => []),
  logger: console,
  now: () => new Date(),
  invokeModel: jest.fn(async () => ({ ok: true }))
});

describe('forwardAgenticTrigger — start/restart flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues a new run and returns 202 when startAgenticRun succeeds', async () => {
    const fakeRun = { Artikel_Nummer: 'A-001', Status: 'queued' };
    agenticModule.startAgenticRun.mockResolvedValue({ queued: true, agentic: fakeRun });

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-001', artikelbeschreibung: 'Laptop Dell' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect((result.body as { agentic: unknown }).agentic).toEqual(fakeRun);
    expect(agenticModule.startAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'A-001', searchQuery: 'Laptop Dell' }),
      expect.any(Object)
    );
    expect(agenticModule.restartAgenticRun).not.toHaveBeenCalled();
  });

  it('returns 200 with existing run when an active run already exists', async () => {
    const activeRun = { Artikel_Nummer: 'A-002', Status: 'running' };
    agenticModule.startAgenticRun.mockResolvedValue({
      queued: false,
      reason: 'already-exists',
      agentic: activeRun
    });

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-002', artikelbeschreibung: 'Monitor HP' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect((result.body as { agentic: unknown }).agentic).toEqual(activeRun);
    expect(agenticModule.restartAgenticRun).not.toHaveBeenCalled();
  });

  it('restarts a non-active existing run and returns 202', async () => {
    const staleRun = { Artikel_Nummer: 'A-003', Status: 'approved' };
    const requeued = { Artikel_Nummer: 'A-003', Status: 'queued' };
    agenticModule.startAgenticRun.mockResolvedValue({
      queued: false,
      reason: 'already-exists',
      agentic: staleRun
    });
    agenticModule.restartAgenticRun.mockResolvedValue({ queued: true, agentic: requeued });

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-003', artikelbeschreibung: 'Drucker Canon' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect(agenticModule.restartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'A-003', searchQuery: 'Drucker Canon' }),
      expect.any(Object)
    );
  });

  it('returns 409 when restart is declined', async () => {
    agenticModule.startAgenticRun.mockResolvedValue({
      queued: false,
      reason: 'already-exists',
      agentic: { Artikel_Nummer: 'A-004', Status: 'approved' }
    });
    agenticModule.restartAgenticRun.mockResolvedValue({ queued: false, reason: 'concurrent-lock' });

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-004', artikelbeschreibung: 'Scanner Epson' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect((result.body as { reason: string }).reason).toBe('concurrent-lock');
  });

  it('returns 409 when start is declined for a reason other than already-exists', async () => {
    agenticModule.startAgenticRun.mockResolvedValue({ queued: false, reason: 'queue-full' });

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-005', artikelbeschreibung: 'Tastatur Logitech' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('returns 500 when startAgenticRun throws', async () => {
    agenticModule.startAgenticRun.mockRejectedValue(new Error('db error'));

    const result = await forwardAgenticTrigger(
      { artikelNummer: 'A-006', artikelbeschreibung: 'Maus Logitech' },
      { context: 'test', service: makeServiceDeps() }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });
});

describe('buildAgenticRunRequestBody', () => {
  it('extracts artikelNummer and artikelbeschreibung from the payload', () => {
    const result = buildAgenticRunRequestBody({
      artikelNummer: 'X-99',
      artikelbeschreibung: 'Testgerät'
    });
    expect(result.artikelNummer).toBe('X-99');
    expect(result.artikelbeschreibung).toBe('Testgerät');
  });

  it('falls back to search when artikelbeschreibung is missing', () => {
    const result = buildAgenticRunRequestBody({
      artikelNummer: 'X-100',
      search: 'Fallback-Suche'
    });
    expect(result.artikelbeschreibung).toBe('Fallback-Suche');
  });

  it('throws AgenticTriggerValidationError when artikelbeschreibung and search are both missing', () => {
    expect(() =>
      buildAgenticRunRequestBody({ artikelNummer: 'X-101' })
    ).toThrow(AgenticTriggerValidationError);
  });
});
