// resolvePrinterQueue's per-site routing branch (docs/PLANNING_multi_instance.md).
// Mock db.ts and agentConnections.ts entirely — db.ts pulls in the full pg pool at
// module load, which we don't want in a unit test; agentConnections is a thin Map wrapper.
// config.ts is also mocked because its PRINTER_QUEUE_* exports are captured from
// process.env once at import time, which would otherwise make per-test env overrides ineffective.
jest.mock('../backend/db', () => ({
  getPrinterQueuesForSite: jest.fn(async () => []),
}));

jest.mock('../backend/agentConnections', () => ({
  isAgentConnected: jest.fn(() => false),
}));

jest.mock('../backend/config', () => ({
  PRINTER_QUEUE: '',
  PRINTER_QUEUE_BOX: '',
  PRINTER_QUEUE_ITEM: '',
  PRINTER_QUEUE_ITEM_SMALL: '',
  PRINTER_QUEUE_SHELF: '',
  PRINTER_QUEUE_MARKETING: '',
  PRINTER_SERVER: '',
  LP_COMMAND: 'lp',
  LPSTAT_COMMAND: 'lpstat',
  PRINT_TIMEOUT_MS: 5000,
}));

// getAllSettings receives the config-derived defaults as its argument; controlling its
// return value sidesteps the fact that config.ts's exports are frozen ESM bindings
// (PRINTER_QUEUE_ITEM etc. can't be reassigned from a test after import).
jest.mock('../backend/utils/app-settings', () => ({
  getSetting: jest.fn(async (_key: string, defaultValue = '') => defaultValue ?? ''),
  getAllSettings: jest.fn(async (defaults: Record<string, string>) => ({ ...defaults })),
}));

import { resolvePrinterQueue } from '../backend/print';

const { getPrinterQueuesForSite } = jest.requireMock('../backend/db') as {
  getPrinterQueuesForSite: jest.Mock;
};
const { isAgentConnected } = jest.requireMock('../backend/agentConnections') as {
  isAgentConnected: jest.Mock;
};
const { getAllSettings } = jest.requireMock('../backend/utils/app-settings') as {
  getAllSettings: jest.Mock;
};

function row(overrides: Partial<{
  name: string;
  instance_id: string | null;
  site: string | null;
  label_types: string | null;
}> = {}) {
  return {
    name: 'ShopQueue',
    device_uri: '',
    ppd_model: '',
    media: '',
    description: '',
    enabled: true,
    updated_at: '',
    instance_id: 'shop',
    site: 'Shop',
    label_types: JSON.stringify(['item']),
    ...overrides,
  };
}

describe('resolvePrinterQueue — per-site routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllSettings.mockImplementation(async (defaults: Record<string, string>) => ({ ...defaults }));
  });

  test('routes to the matching site queue when its agent is online', async () => {
    getPrinterQueuesForSite.mockResolvedValue([row()]);
    isAgentConnected.mockReturnValue(true);

    const result = await resolvePrinterQueue('item', 'Shop');

    expect(getPrinterQueuesForSite).toHaveBeenCalledWith('Shop');
    expect(result).toEqual({ queue: 'ShopQueue', source: 'label' });
  });

  test('skips a matching queue whose owning agent is offline', async () => {
    getPrinterQueuesForSite.mockResolvedValue([row()]);
    isAgentConnected.mockReturnValue(false);
    getAllSettings.mockResolvedValue({ 'printer.queue.item': 'FallbackQueue', 'printer.queue.default': '' });

    const result = await resolvePrinterQueue('item', 'Shop');

    expect(result).toEqual({ queue: 'FallbackQueue', source: 'label' });
  });

  test('skips a queue whose label_types does not include the requested label type', async () => {
    getPrinterQueuesForSite.mockResolvedValue([row({ label_types: JSON.stringify(['shelf']) })]);
    isAgentConnected.mockReturnValue(true);
    getAllSettings.mockResolvedValue({ 'printer.queue.item': 'FallbackQueue', 'printer.queue.default': '' });

    const result = await resolvePrinterQueue('item', 'Shop');

    expect(result).toEqual({ queue: 'FallbackQueue', source: 'label' });
  });

  test('tolerates malformed label_types JSON without throwing', async () => {
    getPrinterQueuesForSite.mockResolvedValue([row({ label_types: 'not-json' })]);
    isAgentConnected.mockReturnValue(true);
    getAllSettings.mockResolvedValue({ 'printer.queue.item': 'FallbackQueue', 'printer.queue.default': '' });

    const result = await resolvePrinterQueue('item', 'Shop');

    expect(result).toEqual({ queue: 'FallbackQueue', source: 'label' });
  });

  test('falls back to app_settings/config defaults when no site is given (backward compat)', async () => {
    getAllSettings.mockResolvedValue({ 'printer.queue.item': 'LegacyQueue', 'printer.queue.default': '' });

    const result = await resolvePrinterQueue('item');

    expect(getPrinterQueuesForSite).not.toHaveBeenCalled();
    expect(result).toEqual({ queue: 'LegacyQueue', source: 'label' });
  });

  test('falls back to the default queue, then to missing, when nothing matches', async () => {
    getPrinterQueuesForSite.mockResolvedValue([]);
    getAllSettings.mockResolvedValue({ 'printer.queue.item': '', 'printer.queue.default': 'DefaultQueue' });

    const resultWithDefault = await resolvePrinterQueue('item', 'Shop');
    expect(resultWithDefault).toEqual({ queue: 'DefaultQueue', source: 'default' });

    getAllSettings.mockResolvedValue({ 'printer.queue.item': '', 'printer.queue.default': '' });
    const resultMissing = await resolvePrinterQueue('item', 'Shop');
    expect(resultMissing).toEqual({ queue: '', source: 'missing' });
  });
});
