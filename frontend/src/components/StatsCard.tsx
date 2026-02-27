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
export default function StatsCard({ counts, printerOk, printerReason, health, agentic, className }: Props) {
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
