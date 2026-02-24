process.env.DB_PATH = ':memory:';

import {
  listItemsForExport,
  persistItemInstance,
  persistItemReference,
  upsertAgenticRun
} from '../../db';

describe('db export projection agentic metadata', () => {
  // TODO(agent): Expand export DB assertions if additional agentic columns are introduced for gating.
  test('includes agentic status fields for rows backed by agentic_runs', () => {
    const artikelNummer = 'A-2000';
    const itemUUID = 'item-export-1';
    const now = '2024-02-02T00:00:00.000Z';

    persistItemReference({
      Artikel_Nummer: artikelNummer,
      Artikelbeschreibung: 'Export DB row',
      Veröffentlicht_Status: true
    } as any);

    persistItemInstance({
      ItemUUID: itemUUID,
      Artikel_Nummer: artikelNummer,
      UpdatedAt: now,
      Datum_erfasst: now,
      Auf_Lager: 1
    } as any);

    upsertAgenticRun.run({
      Artikel_Nummer: artikelNummer,
      SearchQuery: 'db export metadata',
      LastSearchLinksJson: null,
      Status: 'reviewed',
      LastModified: now,
      ReviewState: 'approved',
      ReviewedBy: 'tester',
      LastReviewDecision: 'approve',
      LastReviewNotes: null
    });

    const rows = listItemsForExport.all({ createdAfter: null, updatedAfter: null });
    const targetRow = rows.find((row: any) => row.ItemUUID === itemUUID) as any;

    expect(targetRow).toBeTruthy();
    expect(targetRow.AgenticStatus).toBe('reviewed');
    expect(targetRow.AgenticReviewState).toBe('approved');
  });
});
