// Programmable fake for the pg transaction client, driven by the SQL text of each call.
const state = {
  existingSerials: new Set<string>(),
  existingUUIDs: new Set<string>(),
  inserts: [] as Array<{ sql: string; params: any[] }>,
};

const fakeClient = {
  query: jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM items WHERE "SerialNumber"')) {
      const has = state.existingSerials.has(params[0]);
      return { rows: has ? [{ ItemUUID: 'x' }] : [], rowCount: has ? 1 : 0 };
    }
    if (sql.includes('FROM items WHERE "ItemUUID"')) {
      const has = state.existingUUIDs.has(params[0]);
      return { rows: has ? [{ x: 1 }] : [], rowCount: has ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO items')) {
      state.existingUUIDs.add(params[0]);
      state.existingSerials.add(params[1]);
      state.inserts.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO item_relations')) {
      state.inserts.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => fn(fakeClient)),
}));

import { syncInDeviceComponents } from '../in-device-components';

function resetState() {
  state.existingSerials.clear();
  state.existingUUIDs.clear();
  state.inserts = [];
  fakeClient.query.mockClear();
}

describe('syncInDeviceComponents', () => {
  beforeEach(resetState);

  test('creates one in-device component per disk with a usable serial', async () => {
    const logEvent = jest.fn();
    const res = await syncInDeviceComponents(
      'I-100-0001',
      [
        { name: 'nvme0n1', sizeGb: 256, type: 'nvme', serial: 'SER-A', model: 'Samsung' },
        { name: 'sda', sizeGb: 500, type: 'hdd', serial: 'SER-B' },
      ],
      { logEvent, genUUID: (() => { let n = 0; return () => `C-test${n++}`; })() }
    );

    expect(res.created).toHaveLength(2);
    expect(res.skipped).toHaveLength(0);

    const itemInserts = state.inserts.filter((i) => i.sql.startsWith('INSERT INTO items'));
    expect(itemInserts).toHaveLength(2);
    // No Artikel_Nummer, no BoxID for an in-device component.
    expect(itemInserts[0].params[1]).toBe('SER-A'); // SerialNumber slot
    const relInserts = state.inserts.filter((i) => i.sql.startsWith('INSERT INTO item_relations'));
    expect(relInserts).toHaveLength(2);
    expect(relInserts[0].sql).toContain("'Zerlegt_aus'");
    expect(relInserts[0].params[0]).toBe('I-100-0001'); // parent
    expect(relInserts[0].params[2]).toBe('nvme0n1'); // SlotKey
    expect(logEvent).toHaveBeenCalledTimes(2);
  });

  test('skips disks with missing or placeholder serials', async () => {
    const res = await syncInDeviceComponents(
      'I-100-0001',
      [
        { name: 'sda', sizeGb: 500, serial: null },
        { name: 'sdb', sizeGb: 500, serial: 'Default string' },
        { name: 'sdc', sizeGb: 500, serial: '   ' },
      ]
    );
    expect(res.created).toHaveLength(0);
    expect(res.skipped.map((s) => s.reason)).toEqual(['no-serial', 'no-serial', 'no-serial']);
    expect(state.inserts).toHaveLength(0);
  });

  test('falls back to wwn when serial is absent', async () => {
    const res = await syncInDeviceComponents(
      'I-100-0001',
      [{ name: 'sda', sizeGb: 500, serial: null, wwn: '5000c500abc' }],
      { genUUID: () => 'C-fromwwn' }
    );
    expect(res.created).toHaveLength(1);
    expect(res.created[0].serial).toBe('5000c500abc');
  });

  test('is idempotent: a serial that already has an item is skipped', async () => {
    state.existingSerials.add('SER-A');
    const res = await syncInDeviceComponents(
      'I-100-0001',
      [{ name: 'nvme0n1', sizeGb: 256, serial: 'SER-A' }]
    );
    expect(res.created).toHaveLength(0);
    expect(res.skipped[0].reason).toBe('exists');
    expect(state.inserts).toHaveLength(0);
  });

  test('empty/absent disk list is a no-op', async () => {
    expect((await syncInDeviceComponents('I-1', null)).created).toHaveLength(0);
    expect((await syncInDeviceComponents('I-1', [])).created).toHaveLength(0);
  });
});
