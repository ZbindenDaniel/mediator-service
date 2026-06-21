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

    assert.ok(rows.some(([k, v]) => k === 'Schlecht formatiert' && String(v) === '2/4'));
    assert.ok(rows.some(([k, v]) => k === 'Falsche Information' && String(v) === '1/4'));
    assert.ok(rows.some(([k, v]) => k === 'Info unvollständig' && String(v) === '3/4'));
    assert.ok(rows.some(([k]) => k === 'Top fehlende Spezifikationen'));
    assert.ok(rows.some(([k]) => k === 'Metrik-Hinweis'));
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
