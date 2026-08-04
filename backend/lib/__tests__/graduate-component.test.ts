import { graduateComponentInTx, needsGraduation, WriteOnceIdentityError } from '../graduate-component';

// Programmable fake pg client that records UPDATEs and answers the two SELECTs the swap makes.
function makeClient(opts: { existingRef?: string | null; parentArtikel?: string | null } = {}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const client: any = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT "Artikel_Nummer" FROM items')) {
        return { rows: [{ Artikel_Nummer: opts.existingRef ?? null }], rowCount: 1 };
      }
      if (sql.includes('ParentArtikelNummer')) {
        return { rows: opts.parentArtikel ? [{ ParentArtikelNummer: opts.parentArtikel }] : [{ ParentArtikelNummer: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  return { client, calls };
}

const baseParams = {
  oldUUID: 'C-abc123',
  newUUID: 'I-000042-0001',
  artikelNummer: '000042',
  boxId: 'B-01',
  location: 'Regal 1',
  now: '2026-08-04T10:00:00.000Z',
};

describe('needsGraduation', () => {
  test('true when there is no Artikelnummer', () => {
    expect(needsGraduation({ ItemUUID: 'C-abc', Artikel_Nummer: null })).toBe(true);
    expect(needsGraduation({ ItemUUID: 'I-x-1', Artikel_Nummer: '' })).toBe(true);
    expect(needsGraduation({ ItemUUID: 'C-abc' })).toBe(true);
  });
  test('false once a reference is set', () => {
    expect(needsGraduation({ ItemUUID: 'I-000042-0001', Artikel_Nummer: '000042' })).toBe(false);
  });
});

describe('graduateComponentInTx', () => {
  test('re-keys every UUID-keyed table and sets identity/box', async () => {
    const { client, calls } = makeClient({ existingRef: null, parentArtikel: '000010' });
    const result = await graduateComponentInTx(client, baseParams);

    expect(result.parentArtikelNummer).toBe('000010');
    const updates = calls.filter((c) => c.sql.startsWith('UPDATE'));
    const targets = updates.map((c) => c.sql.match(/UPDATE (\w+)/)?.[1]);
    // items PK+identity, both item_relations directions, events, item_attachments, label_queue.
    expect(targets).toEqual(['items', 'item_relations', 'item_relations', 'events', 'item_attachments', 'label_queue']);

    const itemsUpdate = updates[0];
    expect(itemsUpdate.params).toEqual(['I-000042-0001', '000042', 'B-01', 'Regal 1', baseParams.now, 'C-abc123']);
    // Every re-point maps old → new.
    for (const u of updates.slice(1)) {
      expect(u.params).toEqual(['I-000042-0001', 'C-abc123']);
    }
  });

  test('throws WriteOnceIdentityError when identity already set', async () => {
    const { client } = makeClient({ existingRef: '000099' });
    await expect(graduateComponentInTx(client, baseParams)).rejects.toBeInstanceOf(WriteOnceIdentityError);
  });

  test('throws when the component row is gone', async () => {
    const client: any = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) };
    await expect(graduateComponentInTx(client, baseParams)).rejects.toThrow(/not found/);
  });
});
