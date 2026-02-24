import React from 'react';
import type { ItemDetailReviewAutomationSignal } from '../../../models';

export function formatMetricWithSample(
  metric: { count: number; pct: number },
  sampleSize: number,
  sampleTarget: number
): string {
  return `${metric.count}/${sampleSize}`; //  ${metric.pct.toFixed(1)}% (${metric.count}/${sampleSize}; Fenster ${sampleTarget})
}

export function buildAgenticReviewMetricRows(
  signal: ItemDetailReviewAutomationSignal | null,
  warning: string | null
): [string, React.ReactNode][] {
  // TODO(agentic-metrics-ui): Keep metric copy concise if additional trigger dimensions are added.
  if (!signal) {
    if (warning) {
      return [['Review-Metriken', warning]];
    }
    return [['Review-Metriken', 'Keine Daten (0 Stichproben).']];
  }

  const sampleSize = signal.sampleSize;
  const sampleTarget = signal.sampleTarget;
  const rows: [string, React.ReactNode][] = [
    // ['Review-Metriken (Stichprobe)', `${sampleSize}/${sampleTarget}`],
    ['Schlecht formatiert', formatMetricWithSample(signal.metrics.bad_format_true, sampleSize, sampleTarget)],
    ['Falsche Information', formatMetricWithSample(signal.metrics.wrong_information_true, sampleSize, sampleTarget)],
    [
      'Falsche phys. Maße',
      formatMetricWithSample(signal.metrics.wrong_physical_dimensions_true, sampleSize, sampleTarget)
    ],
    ['Info unvollständig', formatMetricWithSample(signal.metrics.information_present_false, sampleSize, sampleTarget)]
  ];

  const topMissing = signal.missingSpecTopKeys.length > 0
    ? signal.missingSpecTopKeys
      .map((entry) => `${entry.key}: ${entry.pct.toFixed(1)}% (${entry.count}/${sampleSize})`)
      .join(', ')
    : 'Keine';
  rows.push(['Top fehlende Spezifikationen', topMissing]);

  const activeTriggers = Object.entries(signal.triggerStates)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(', ');
  // rows.push(['Trigger aktiv', activeTriggers || 'Keine']);

  if (signal.lowConfidence) {
    rows.push(['Metrik-Hinweis', 'Niedrige Sicherheit (kleine Stichprobe).']);
  }

  return rows;
}
