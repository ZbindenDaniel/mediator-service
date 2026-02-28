import { Readable } from 'stream';
import action from '../agentic-restart';
import { restartAgenticRun } from '../../agentic';

jest.mock('../../agentic', () => ({
  restartAgenticRun: jest.fn().mockResolvedValue({ queued: true, agentic: null })
}));

function createReq(path: string, body: unknown) {
  const stream = Readable.from([JSON.stringify(body)]) as Readable & { method?: string; url?: string };
  stream.method = 'POST';
  stream.url = path;
  return stream;
}

function createRes() {
  return {
    statusCode: 0,
    body: '',
    writeHead: jest.fn(function writeHead(this: any, status: number) {
      this.statusCode = status;
      return this;
    }),
    end: jest.fn(function end(this: any, payload: string) {
      this.body = payload;
      return this;
    })
  };
}

describe('agentic-restart action', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards full review metadata payload including structured fields', async () => {
    const req = createReq('/api/item-refs/R-100/agentic/restart', {
      actor: 'tester',
      search: 'query',
      review: {
        decision: 'reject',
        notes: 'needs more detail',
        reviewedBy: 'ops',
        information_present: false,
        missing_spec: ['height'],
        unneeded_spec: ['legacy'],
        bad_format: true,
        wrong_information: true,
        wrong_physical_dimensions: false
      }
    });
    const res = createRes();

    await action.handle(req as any, res as any, {
      db: {},
      getAgenticRun: {},
      getItemReference: {},
      upsertAgenticRun: {},
      updateAgenticRunStatus: {},
      logEvent: jest.fn()
    });

    expect(restartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expect.objectContaining({
          missing_spec: ['height'],
          unneeded_spec: ['legacy'],
          bad_format: true,
          wrong_information: true,
          wrong_physical_dimensions: false
        })
      }),
      expect.any(Object)
    );
  });



  it('normalizes review spec arrays with shared cap and dedupe before handoff', async () => {
    const req = createReq('/api/item-refs/R-100/agentic/restart', {
      actor: 'tester',
      search: 'query',
      review: {
        missing_spec: [' Höhe ', 'höhe', 'Breite', '', ' '.repeat(2)],
        unneeded_spec: Array.from({ length: 14 }, (_, index) => `field ${index + 1}`)
      }
    });
    const res = createRes();

    await action.handle(req as any, res as any, {
      db: {},
      getAgenticRun: {},
      getItemReference: {},
      upsertAgenticRun: {},
      updateAgenticRunStatus: {},
      logEvent: jest.fn()
    });

    expect(restartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expect.objectContaining({
          missing_spec: ['Höhe', 'Breite'],
          unneeded_spec: ['field 1', 'field 2', 'field 3', 'field 4', 'field 5', 'field 6', 'field 7', 'field 8', 'field 9', 'field 10']
        })
      }),
      expect.any(Object)
    );
  });

  it('forwards replaceReviewMetadata control flag', async () => {
    const req = createReq('/api/item-refs/R-100/agentic/restart', {
      actor: 'tester',
      search: 'query',
      replaceReviewMetadata: true
    });
    const res = createRes();

    await action.handle(req as any, res as any, {
      db: {},
      getAgenticRun: {},
      getItemReference: {},
      upsertAgenticRun: {},
      updateAgenticRunStatus: {},
      logEvent: jest.fn()
    });

    expect(restartAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        replaceReviewMetadata: true
      }),
      expect.any(Object)
    );
  });
});
