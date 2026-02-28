import { selectExampleItemBlock, STATIC_EXAMPLE_ITEM_BLOCK } from '../example-selector';

describe('selectExampleItemBlock', () => {
  it('uses two latest approved reviewed examples from the same candidate list', () => {
    const result = selectExampleItemBlock({
      currentItemId: 'R-200',
      candidates: [
        {
          Artikel_Nummer: 'R-101',
          LastReviewDecision: 'approved',
          ReviewedAt: '2025-01-01T00:00:00.000Z',
          Artikelbeschreibung: 'Older item'
        },
        {
          Artikel_Nummer: 'R-102',
          LastReviewDecision: 'approved',
          ReviewedAt: '2025-02-01T00:00:00.000Z',
          Artikelbeschreibung: 'Newest item',
          Kurzbeschreibung: 'short',
          Hersteller: 'Maker',
          Langtext: { Motor: '220W' }
        }
      ]
    });

    expect(result.fallbackReason).toBeNull();
    expect(result.selectedExampleIds).toEqual(['R-102', 'R-101']);
    expect(result.wasTruncated).toBe(false);
    expect(result.exampleBlock).toContain('Reviewed example item 1 (redacted)');
    expect(result.exampleBlock).toContain('Reviewed example item 2 (redacted)');
    expect(result.exampleBlock).toContain('"Artikelbeschreibung": "Newest item"');
    expect(result.exampleBlock).not.toContain('R-102');
  });

  it('falls back to static example block when no reviewed example exists', () => {
    const result = selectExampleItemBlock({
      currentItemId: 'R-200',
      candidates: [
        {
          Artikel_Nummer: 'R-101',
          LastReviewDecision: 'changes_requested',
          ReviewedAt: '2025-02-01T00:00:00.000Z'
        }
      ]
    });

    expect(result.selectedExampleIds).toEqual([]);
    expect(result.fallbackReason).toBe('no-reviewed-example');
    expect(result.wasTruncated).toBe(false);
    expect(result.exampleBlock).toBe(STATIC_EXAMPLE_ITEM_BLOCK);
  });

  it('truncates oversize reviewed payloads and reports truncation', () => {
    const result = selectExampleItemBlock({
      currentItemId: 'R-200',
      maxExampleChars: 120,
      candidates: [
        {
          Artikel_Nummer: 'R-999',
          LastReviewDecision: 'approved',
          ReviewedAt: '2025-02-01T00:00:00.000Z',
          Artikelbeschreibung: 'A'.repeat(500),
          Langtext: { LongSpec: 'B'.repeat(1000) }
        }
      ]
    });

    expect(result.selectedExampleIds).toEqual(['R-999']);
    expect(result.fallbackReason).toBeNull();
    expect(result.wasTruncated).toBe(true);
    expect(result.exampleBlock.endsWith('…')).toBe(true);
    expect(result.exampleBlock.length).toBeLessThanOrEqual(122);
  });
});
