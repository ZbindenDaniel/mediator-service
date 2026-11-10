// The keep-busy feeder must never pull ref-only rows (no items instance) into the agentic queue.
// No live Postgres in the suite, so this pins the SQL guard on the three feeder queries.
jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({}))
}));

import { query, execute } from '../backend/db-client';
import {
  claimNotStartedAgenticRuns,
  enrolItemRefsWithoutAgenticRun,
  listItemRefsWithoutAgenticRun
} from '../backend/db';

const INSTANCE_GUARD = /AND EXISTS \(SELECT 1 FROM items it WHERE it\."Artikel_Nummer" = /;

function lastSql(mockFn: unknown): string {
  const calls = (mockFn as jest.Mock).mock.calls;
  return String(calls[calls.length - 1][0]);
}

describe('agentic auto-feed instance guard', () => {
  beforeEach(() => jest.clearAllMocks());

  test('notStarted → queued promotion skips refs without an instance', async () => {
    await claimNotStartedAgenticRuns(3);
    const sql = lastSql(query);
    expect(sql).toMatch(INSTANCE_GUARD);
    expect(sql).toContain('agentic_runs."Artikel_Nummer"');
  });

  test('enrolment only creates runs for refs with an instance', async () => {
    await enrolItemRefsWithoutAgenticRun(3);
    expect(lastSql(execute)).toMatch(INSTANCE_GUARD);
  });

  test('enrol-time triage lists the same instance-backed refs', async () => {
    await listItemRefsWithoutAgenticRun(3);
    expect(lastSql(query)).toMatch(INSTANCE_GUARD);
  });
});
