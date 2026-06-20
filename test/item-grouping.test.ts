import { groupItemsForResponse } from '../backend/lib/itemGrouping';

describe('groupItemsForResponse', () => {
  it('groups identical items together and counts them', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null },
      { ItemUUID: 'I-2024-A-0003', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].Artikel_Nummer).toBe('A-100');
    expect(result[0].Quality).toBe(4);
    expect(result[0].BoxID).toBe('B-01');
  });

  it('separates items that differ in quality', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 3, BoxID: 'B-01', Location: null },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(2);
    const q3 = result.find((r) => r.Quality === 3);
    const q4 = result.find((r) => r.Quality === 4);
    expect(q3?.count).toBe(1);
    expect(q4?.count).toBe(1);
  });

  it('separates items that differ in BoxID', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-02', Location: null }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(2);
  });

  it('prefers the canonical sequence-1 instance as representativeItemId', () => {
    // parseSequentialItemUUID matches format WORD-NNNN (no dashes in WORD)
    // so R100-0001 has sequence=1 (canonical), R100-0002 has sequence=2
    const items = [
      { ItemUUID: 'R100-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null },
      { ItemUUID: 'R100-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    // The sequence-1 UUID (R100-0001) overwrites the first-inserted R100-0002 as representative
    expect(result[0].representativeItemId).toBe('R100-0001');
  });

  it('groups items by Location when BoxID is null', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: null, Location: 'Regal-3' },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: null, Location: 'Regal-3' },
      { ItemUUID: 'I-2024-A-0003', Artikel_Nummer: 'A-100', Quality: 4, BoxID: null, Location: 'Regal-4' }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(2);
    const regal3 = result.find((r) => r.Location === 'Regal-3');
    const regal4 = result.find((r) => r.Location === 'Regal-4');
    expect(regal3?.count).toBe(2);
    expect(regal4?.count).toBe(1);
    expect(regal3?.BoxID).toBeNull();
  });

  it('BoxID takes priority over Location — Location is nulled when BoxID is set', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: 'Regal-3' }
    ];

    const result = groupItemsForResponse(items);

    expect(result[0].BoxID).toBe('B-01');
    expect(result[0].Location).toBeNull();
  });

  it('groups items by category when Unterkategorien_A is present', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null, Unterkategorien_A: 201 },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null, Unterkategorien_A: 301 }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(2);
    const cat201 = result.find((r) => r.Category === '0201');
    const cat301 = result.find((r) => r.Category === '0301');
    expect(cat201).toBeDefined();
    expect(cat301).toBeDefined();
  });

  it('normalizes category strings with zero-padding', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null, Unterkategorien_A: '99' }
    ];

    const result = groupItemsForResponse(items);

    expect(result[0].Category).toBe('0099');
  });

  it('places items with null Quality in their own group with null quality', () => {
    const items = [
      { ItemUUID: 'I-2024-A-0001', Artikel_Nummer: 'A-100', Quality: null, BoxID: 'B-01', Location: null },
      { ItemUUID: 'I-2024-A-0002', Artikel_Nummer: 'A-100', Quality: 4, BoxID: 'B-01', Location: null }
    ];

    const result = groupItemsForResponse(items);

    expect(result).toHaveLength(2);
    const nullQuality = result.find((r) => r.Quality === null);
    expect(nullQuality?.count).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(groupItemsForResponse([])).toEqual([]);
  });
});
