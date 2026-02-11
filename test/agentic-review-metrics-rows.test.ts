import assert from 'assert';
import { buildAgenticReviewMetricRows } from '../frontend/src/components/AgenticReviewMetricsRows';

describe('agentic review metric rows', () => {
  test('builds populated metric rows with sample denominator context', () => {
    const rows = buildAgenticReviewMetricRows(
      {
        sampleSize: 4,
        sampleTarget: 10,
        lowConfidence: true,
        metrics: {
          bad_format_true: { count: 2, pct: 50 },
          wrong_information_true: { count: 1, pct: 25 },
          wrong_physical_dimensions_true: { count: 0, pct: 0 },
          information_present_false: { count: 3, pct: 75 }
        },
        missingSpecTopKeys: [{ key: 'Spannung', count: 2, pct: 50 }],
        triggerStates: {
          bad_format_trigger: true,
          wrong_information_trigger: false,
          wrong_physical_dimensions_trigger: false,
          missing_spec_trigger: true,
          information_present_low_trigger: false
        }
      },
      null
    );

    assert.equal(rows[0][0], 'Review-Metriken (Stichprobe)');
    assert.equal(rows[0][1], '4/10');
    assert.ok(rows.some(([k, v]) => k === 'Bad Format' && String(v).includes('50.0% (2/4; Fenster 10)')));
    assert.ok(rows.some(([k, v]) => k === 'Trigger aktiv' && String(v).includes('bad_format_trigger')));
  });

  test('builds empty fallback rows when signal is unavailable', () => {
    const rows = buildAgenticReviewMetricRows(null, null);
    assert.deepEqual(rows, [['Review-Metriken', 'Keine Daten (0 Stichproben).']]);
  });

  test('builds warning rows when signal loading failed', () => {
    const rows = buildAgenticReviewMetricRows(null, 'Metriken sind derzeit nicht verfügbar.');
    assert.deepEqual(rows, [['Review-Metriken', 'Metriken sind derzeit nicht verfügbar.']]);
  });
});
