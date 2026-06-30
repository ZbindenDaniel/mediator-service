// upsertDiscoveredQueue/updatePrinterQueueRouting/listAllPrinterQueues — Worker nodes
// admin view (docs/PLANNING_multi_instance.md). Mocks db-client so db.ts's real SQL-building
// logic runs against fakes, without touching a real Postgres instance.
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

import { upsertDiscoveredQueue, updatePrinterQueueRouting, listAllPrinterQueues } from '../backend/db';

const { query, queryOne, execute } = jest.requireMock('../backend/db-client') as {
  query: jest.Mock;
  queryOne: jest.Mock;
  execute: jest.Mock;
};

describe('upsertDiscoveredQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults site to the instanceId when no other queue of that instance has a site set', async () => {
    queryOne.mockResolvedValueOnce(null);

    await upsertDiscoveredQueue('shop', 'ShopQueue');

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO printer_queues'),
      ['ShopQueue', 'shop', 'shop']
    );
  });

  test('reuses an existing sibling queue\'s site instead of the instanceId', async () => {
    queryOne.mockResolvedValueOnce({ site: 'Warehouse' });

    await upsertDiscoveredQueue('shop', 'ShopQueue2');

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO printer_queues'),
      ['ShopQueue2', 'shop', 'Warehouse']
    );
  });
});

describe('updatePrinterQueueRouting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates site and JSON-encodes labelTypes, returns true on success', async () => {
    execute.mockResolvedValueOnce(1);

    const result = await updatePrinterQueueRouting('ShopQueue', 'Shop', ['item', 'smallitem']);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE printer_queues'),
      ['ShopQueue', 'Shop', JSON.stringify(['item', 'smallitem'])]
    );
    expect(result).toBe(true);
  });

  test('returns false when no row was updated', async () => {
    execute.mockResolvedValueOnce(0);

    const result = await updatePrinterQueueRouting('Unknown', 'Shop', ['item']);

    expect(result).toBe(false);
  });
});

describe('listAllPrinterQueues', () => {
  test('selects all printer_queues rows ordered by instance then name', async () => {
    query.mockResolvedValueOnce([{ name: 'ShopQueue' }]);

    const rows = await listAllPrinterQueues();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM printer_queues ORDER BY instance_id'));
    expect(rows).toEqual([{ name: 'ShopQueue' }]);
  });
});
