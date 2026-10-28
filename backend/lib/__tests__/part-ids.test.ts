jest.mock('../../db-client', () => ({ queryOne: jest.fn(async () => null) }));
jest.mock('../quality-score', () => ({ resolveEffectiveSubCategory: jest.fn(async () => 201) }));
jest.mock('../../contracts/registry', () => ({
  getAssemblyContract: jest.fn(() => ({
    version: 1,
    subCategory: 201,
    parts: [{ key: 'battery', label: 'Akku', targetSubcategory: 2132 }],
  })),
}));

import { mintPartItemUUID, resolveSlotSubCategory, PartIdError } from '../part-ids';

// Fake queryOne answering the two statements minting runs: root walk-up, then counter lookup.
function makeQueryOne(opts: { root: string | null; latest?: string | null }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const fn = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('WITH RECURSIVE')) return opts.root === null ? undefined : { Artikel_Nummer: opts.root };
    if (sql.includes('LIKE')) return opts.latest ? { ItemUUID: opts.latest } : undefined;
    return undefined;
  });
  return { queryOne: fn as any, calls };
}

describe('mintPartItemUUID', () => {
  test('first part of a pair gets 0001 and the counter is scoped to its stem', async () => {
    const { queryOne, calls } = makeQueryOne({ root: '104523' });
    await expect(mintPartItemUUID('C-104523-2101-0001', 2109, queryOne)).resolves.toBe('C-104523-2109-0001');
    // Walk-up starts at the given parent; the counter only looks at C-104523-2109-*.
    expect(calls[0].params[0]).toBe('C-104523-2101-0001');
    expect(calls[1].params).toEqual(['C-104523-2109-%', 'C-104523-2109-'.length + 1]);
  });

  test('continues after the highest existing number', async () => {
    const { queryOne } = makeQueryOne({ root: '104523', latest: 'C-104523-2132-0002' });
    await expect(mintPartItemUUID('I-104523-0001', 2132, queryOne)).resolves.toBe('C-104523-2132-0003');
  });

  test('a root Artikelnummer unfit for an ID stem is a PartIdError, not a crash', async () => {
    const { queryOne } = makeQueryOne({ root: '10-45' });
    await expect(mintPartItemUUID('I-x', 2132, queryOne)).rejects.toBeInstanceOf(PartIdError);
  });

  test('a root device without Artikelnummer is a PartIdError', async () => {
    const { queryOne } = makeQueryOne({ root: null });
    await expect(mintPartItemUUID('I-x', 2132, queryOne)).rejects.toBeInstanceOf(PartIdError);
  });
});

describe('resolveSlotSubCategory', () => {
  test('target of a known slot, null for a scan device name', async () => {
    await expect(resolveSlotSubCategory('I-104523-0001', 'battery')).resolves.toBe(2132);
    await expect(resolveSlotSubCategory('I-104523-0001', 'nvme0n1')).resolves.toBeNull();
  });
});
