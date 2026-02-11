import type { AgenticRunReviewHistoryEntry } from '../../../models';
import {
  aggregateReviewAutomationSignals,
  loadSubcategoryReviewAutomationSignals
} from '../review-automation-signals';

function makeHistoryEntry(
  id: number,
  metadata: Record<string, unknown>,
  overrides: Partial<AgenticRunReviewHistoryEntry> = {}
): AgenticRunReviewHistoryEntry {
  return {
    Id: id,
    Artikel_Nummer: overrides.Artikel_Nummer ?? `R-${id}`,
    Status: overrides.Status ?? 'review',
    ReviewState: overrides.ReviewState ?? 'rejected',
    ReviewDecision: overrides.ReviewDecision ?? 'rejected',
    ReviewNotes: overrides.ReviewNotes ?? null,
    ReviewMetadata: JSON.stringify(metadata),
    ReviewedBy: overrides.ReviewedBy ?? 'reviewer',
    RecordedAt: overrides.RecordedAt ?? new Date(1700000000000 + id * 1000).toISOString()
  };
}

describe('review automation signal aggregation', () => {
  test('keeps trigger thresholds inclusive at documented boundaries for full sample', () => {
    const history: AgenticRunReviewHistoryEntry[] = Array.from({ length: 10 }, (_, idx) =>
      makeHistoryEntry(idx + 1, {
        bad_format: idx < 3,
        wrong_information: idx < 3,
        wrong_physical_dimensions: idx < 2,
        information_present: idx < 4 ? false : true,
        missing_spec: idx < 2 ? ['width'] : []
      })
    );

    const signals = aggregateReviewAutomationSignals(history, { info: jest.fn(), warn: jest.fn(), error: jest.fn() });

    expect(signals.bad_format_trigger).toBe(true);
    expect(signals.wrong_information_trigger).toBe(true);
    expect(signals.wrong_physical_dimensions_trigger).toBe(true);
    expect(signals.missing_spec_trigger).toBe(true);
    expect(signals.information_present_low_trigger).toBe(true);
    expect(signals.badFormatTruePct).toBe(30);
    expect(signals.informationPresentFalsePct).toBe(40);
    expect(signals.missingSpecTopKeys[0]).toEqual(
      expect.objectContaining({ key: 'width', count: 2, pct: 20 })
    );
  });

  test('uses proportional threshold logic and marks low confidence for low sample sizes', () => {
    const history: AgenticRunReviewHistoryEntry[] = [
      makeHistoryEntry(1, {
        bad_format: true,
        wrong_information: false,
        wrong_physical_dimensions: true,
        information_present: false,
        missing_spec: ['height']
      }),
      makeHistoryEntry(2, {
        bad_format: false,
        wrong_information: true,
        wrong_physical_dimensions: false,
        information_present: true,
        missing_spec: []
      }),
      makeHistoryEntry(3, {
        bad_format: false,
        wrong_information: false,
        wrong_physical_dimensions: false,
        information_present: true,
        missing_spec: []
      }),
      makeHistoryEntry(4, {
        bad_format: false,
        wrong_information: false,
        wrong_physical_dimensions: false,
        information_present: true,
        missing_spec: []
      })
    ];

    const signals = aggregateReviewAutomationSignals(history, { info: jest.fn(), warn: jest.fn(), error: jest.fn() });

    expect(signals.sampleSize).toBe(4);
    expect(signals.lowConfidence).toBe(true);
    expect(signals.bad_format_trigger).toBe(false);
    expect(signals.wrong_information_trigger).toBe(false);
    expect(signals.wrong_physical_dimensions_trigger).toBe(true);
    expect(signals.missing_spec_trigger).toBe(true);
    expect(signals.information_present_low_trigger).toBe(false);
  });

  test('loads subcategory history window before aggregating signals', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const history = [
      makeHistoryEntry(1, { bad_format: true, missing_spec: ['weight'], information_present: false }),
      makeHistoryEntry(2, { bad_format: false, missing_spec: ['weight'], information_present: true })
    ];

    const signals = loadSubcategoryReviewAutomationSignals('R-200', {
      getItemReference: {
        get: jest.fn(() => ({ Unterkategorien_A: 12 }))
      },
      listRecentReviewHistoryBySubcategory: jest.fn(() => history),
      logger
    });

    expect(signals.sampleSize).toBe(2);
    expect(signals.missing_spec_trigger).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      '[agentic-review-automation] Loaded reviewed history window for subcategory aggregation',
      expect.objectContaining({ subcategory: 12, sampleSize: 2, sampleTarget: 10 })
    );
  });
});
