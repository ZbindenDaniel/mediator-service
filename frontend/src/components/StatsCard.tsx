import React, { useMemo } from 'react';
import {
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_RUNNING,
  type AgenticRunStatus
} from '../../../models';
import type { Co2ImpactLabel } from '../../../models/co2';
import { CO2_IMPACT_LABEL_DE } from '../../../models/co2';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';

interface Counts {
  boxes: number;
  items: number;
  itemsNoBox: number;
}

interface AgenticOverviewStats {
  stateCounts?: Partial<Record<AgenticRunStatus, number>>;
  enrichedItems?: number;
}

interface Props {
  counts?: Counts;
  printerOk: boolean | null;
  printerReason?: string | null;
  health: string;
  agentic?: AgenticOverviewStats;
  co2LabelCounts?: Partial<Record<Co2ImpactLabel, number>>;
  co2ScoreSums?: Partial<Record<Co2ImpactLabel, number>>;
  totalWeightKg?: number;
  totalPriceValue?: number;
  className?: string;
}

type PieSegment = { status: AgenticRunStatus; value: number; color: string };

const PIE_STATUS_ORDER: AgenticRunStatus[] = [
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED
];

const PIE_COLORS: Record<AgenticRunStatus, string> = {
  running: '#4f46e5',
  queued: '#60a5fa',
  review: '#f59e0b',
  approved: '#10b981',
  rejected: '#f97316',
  failed: '#ef4444',
  cancelled: '#6b7280',
  notStarted: '#d1d5db'
};

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

// TODO(agentic-overview-chart): Add optional layered segments (shopartikel / quality) when data contract is finalized.
function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  return `${Math.round(kg)} kg`;
}

export default function StatsCard({ counts, printerOk, printerReason, health, agentic, totalWeightKg, totalPriceValue, co2LabelCounts, co2ScoreSums, className }: Props) {
  const classes = ['card', className].filter(Boolean).join(' ');

  const pieSegments = useMemo<PieSegment[]>(() => {
    try {
      const stateCounts = agentic?.stateCounts ?? {};
      return PIE_STATUS_ORDER.map((status) => ({ status, value: safeNumber(stateCounts[status]), color: PIE_COLORS[status] }))
        .filter((segment) => segment.value > 0);
    } catch (error) {
      console.warn('Failed to normalize agentic state counts for statistics chart', error);
      return [];
    }
  }, [agentic?.stateCounts]);

  const pieChartStyle = useMemo(() => {
    const total = pieSegments.reduce((sum, segment) => sum + segment.value, 0);
    if (total <= 0) {
      return { background: '#e5e7eb' };
    }

    let current = 0;
    const stops = pieSegments.map((segment) => {
      const start = current;
      current += (segment.value / total) * 360;
      return `${segment.color} ${start.toFixed(2)}deg ${current.toFixed(2)}deg`;
    });

    return { background: `conic-gradient(${stops.join(', ')})` };
  }, [pieSegments]);

  const totalAgentic = pieSegments.reduce((sum, segment) => sum + segment.value, 0);
  const enrichedItems = safeNumber(agentic?.enrichedItems);

  const approvedRuns = safeNumber(agentic?.stateCounts?.['approved' as AgenticRunStatus]);
  const rejectedRuns = safeNumber(agentic?.stateCounts?.['rejected' as AgenticRunStatus]);
  const failedRuns = safeNumber(agentic?.stateCounts?.['failed' as AgenticRunStatus]);
  const decidedRuns = approvedRuns + rejectedRuns + failedRuns;
  const hitRate = decidedRuns > 0 ? Math.round((approvedRuns / decidedRuns) * 100) : null;
  const enrichmentRate = counts && counts.items > 0 ? Math.round((enrichedItems / counts.items) * 100) : null;

  return (
    <div className={classes}>
      <h2>Statistiken</h2>
      {/* TODO(stats-card-layout): Re-check half-width split on very narrow tablets if card order changes again. */}
      <div className="stats-card-main">
        <div className="stats-card-left">
          {counts ? (
            <div id="stats" className="list">
              <div>Behälter gesamt <b>{counts.boxes}</b></div>
              <div>Artikel gesamt: <b>{counts.items}</b></div>
              <div>Artikel ohne Behälter: <b>{counts.itemsNoBox}</b></div>
              {co2LabelCounts && (['high', 'medium', 'low'] as Co2ImpactLabel[]).some(l => (co2LabelCounts[l] ?? 0) > 0) && (
                <div>CO₂ Potenzial:{' '}
                  {(['high', 'medium', 'low'] as Co2ImpactLabel[])
                    .filter(l => (co2LabelCounts[l] ?? 0) > 0)
                    .map(l => {
                      const count = co2LabelCounts[l] ?? 0;
                      const avgScore = count > 0 && co2ScoreSums?.[l]
                        ? Math.round(co2ScoreSums[l]! / count)
                        : null;
                      return (
                        <span key={l}>
                          {CO2_IMPACT_LABEL_DE[l]}: <b>{count}</b>
                          {avgScore !== null && <span className="muted"> (~{avgScore} kg CO₂)</span>}
                          {' '}
                        </span>
                      );
                    })
                  }
                </div>
              )}
              {hitRate !== null && (
                <div>KI-Trefferquote: <b>{hitRate}%</b></div>
              )}
              {enrichmentRate !== null && (
                <div>Angereichert: <b>{enrichmentRate}%</b></div>
              )}
              {typeof totalWeightKg === 'number' && totalWeightKg > 0 && (
                <div>Gesamt-Gewicht: <b>{formatWeight(totalWeightKg)}</b></div>
              )}
              {typeof totalPriceValue === 'number' && totalPriceValue > 0 && (
                <div>Gesamtwert: <b>CHF {totalPriceValue.toLocaleString('de-CH', { maximumFractionDigits: 0 })}</b></div>
              )}
            </div>
          ) : (
            <div className="muted">Übersicht konnte nicht geladen werden</div>
          )}
        </div>

        <div className="stats-card-right">
          <div className="agentic-stats-chart">
            <div className="agentic-pie" style={pieChartStyle} role="img" aria-label="Verteilung der KI-Status"></div>
            <div className="agentic-stats-summary">
              <div>Enriched <b>{enrichedItems}</b></div>
              <div>Ki-Läufe <b>{totalAgentic}</b></div>
            </div>
          </div>

          {/* TODO(agentic-overview-legend): Revisit non-hover value disclosure for touch-first devices if operators request it. */}
          <div className="agentic-pie-legend">
            {pieSegments.length ? pieSegments.map((segment) => {
              const label = describeAgenticStatus(segment.status);
              return (
                <span
                  key={segment.status}
                  className="agentic-pie-legend-dot"
                  style={{ background: segment.color }}
                  title={`${label}: ${segment.value}`}
                  aria-label={`${label}: ${segment.value}`}
                ></span>
              );
            }) : <div className="muted">Noch keine Ki-Statusdaten</div>}
          </div>
        </div>
      </div>

      {/* TODO(stats-card-status-row): Re-check status row wrapping once printer-reason copy is finalized. */}
      <div className="stats-card-status-row">
        <div className="muted status-info">
          Drucker:{' '}
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: printerOk == null ? '#999' : printerOk ? '#1cbc2c' : '#d22'
            }}
          ></span>
          {printerReason ? (
            <span className="muted" style={{ marginLeft: 8 }}>
              {printerReason}
            </span>
          ) : null}
        </div>
        <div className="muted status-info">Ki:
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: health == null ? '#999' : health === 'ok' ? '#1cbc2c' : '#d22'
            }}
          ></span>
        </div>
      </div>
    </div>
  );
}
