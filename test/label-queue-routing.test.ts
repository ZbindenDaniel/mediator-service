// queueLabel/claimNextLabelJobForAgent — multi-location print routing (docs/PLANNING_multi_instance.md).
// Mock db-client (the pg layer) and agentConnections (the WebSocket liveness map) so db.ts's
// real SQL-building logic runs against fakes, without touching a real Postgres instance.
jest.mock('../backend/db-client', () => ({
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
  insert: jest.fn(async () => undefined),
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 0),
  getPoolInstance: jest.fn(() => ({})),
  execBatch: jest.fn(async () => undefined),
}));

jest.mock('../backend/agentConnections', () => ({
  sendToAgent: jest.fn(),
}));

import { queueLabel, claimNextLabelJobForAgent } from '../backend/db';

const { query, queryOne, execute } = jest.requireMock('../backend/db-client') as {
  query: jest.Mock;
  queryOne: jest.Mock;
  execute: jest.Mock;
};
const { sendToAgent } = jest.requireMock('../backend/agentConnections') as {
  sendToAgent: jest.Mock;
};

describe('queueLabel — job_available push', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('inserts with the given targetQueue and does nothing else when untargeted', async () => {
    await queueLabel('ITEM-1');

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO label_queue'),
      ['ITEM-1', expect.any(String), null]
    );
    expect(queryOne).not.toHaveBeenCalled();
    expect(sendToAgent).not.toHaveBeenCalled();
  });

  test('inserts with the resolved targetQueue', async () => {
    queryOne.mockResolvedValueOnce({ instance_id: null });

    await queueLabel('ITEM-1', 'ShopQueue');

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO label_queue'),
      ['ITEM-1', expect.any(String), 'ShopQueue']
    );
  });

  test('wakes the owning agent via WebSocket when the target queue has a connected instance', async () => {
    queryOne.mockResolvedValueOnce({ instance_id: 'shop' });

    await queueLabel('ITEM-1', 'ShopQueue');

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining('SELECT instance_id FROM printer_queues'),
      ['ShopQueue']
    );
    expect(sendToAgent).toHaveBeenCalledWith('shop', { type: 'job_available' });
  });

  test('does not push job_available when the target queue has no owning instance', async () => {
    queryOne.mockResolvedValueOnce({ instance_id: null });

    await queueLabel('ITEM-1', 'ShopQueue');

    expect(sendToAgent).not.toHaveBeenCalled();
  });

  test('does not look up an owning instance for untargeted jobs', async () => {
    await queueLabel('ITEM-1', null);

    expect(queryOne).not.toHaveBeenCalled();
    expect(sendToAgent).not.toHaveBeenCalled();
  });
});

describe('claimNextLabelJobForAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('claims a job restricted to the agent\'s owned queues, including untargeted jobs', async () => {
    queryOne.mockResolvedValueOnce({ Id: 1, TargetQueue: 'ShopQueue' });

    const result = await claimNextLabelJobForAgent(['ShopQueue', 'ShopSmallQueue']);

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/"TargetQueue" IS NULL OR "TargetQueue" = ANY\(\$2\)/),
      [expect.any(String), ['ShopQueue', 'ShopSmallQueue']]
    );
    expect(result).toEqual({ Id: 1, TargetQueue: 'ShopQueue' });
  });

  test('returns null when no matching job is queued', async () => {
    queryOne.mockResolvedValueOnce(null);

    const result = await claimNextLabelJobForAgent(['WarehouseQueue']);

    expect(result).toBeNull();
  });
});
