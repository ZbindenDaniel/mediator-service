import React, { useEffect, useState } from 'react';
import StatsCard from './StatsCard';

interface OverviewData {
  counts?: { boxes: number; items: number; itemsNoBox: number };
  agentic?: { stateCounts?: Record<string, number>; enrichedItems?: number };
  totalCo2SavedKg?: number;
}

export default function DashboardPanel() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [printerReason, setPrinterReason] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('unknown');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/overview')
      .then((r) => r.json())
      .then((data: OverviewData) => { if (!cancelled) setOverview(data); })
      .catch(() => {});

    fetch('/api/printer/status')
      .then((r) => r.json())
      .then((data: { ok?: boolean; reason?: string }) => {
        if (cancelled) return;
        setPrinterOk(typeof data.ok === 'boolean' ? data.ok : null);
        setPrinterReason(typeof data.reason === 'string' ? data.reason : null);
      })
      .catch(() => {});

    fetch('/api/health')
      .then((r) => r.json())
      .then((data: { ok?: boolean }) => {
        if (cancelled) return;
        setHealth(data.ok === true ? 'ok' : 'error');
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="panel-detail__body">
      <StatsCard
        counts={overview?.counts}
        printerOk={printerOk}
        printerReason={printerReason}
        health={health}
        agentic={overview?.agentic}
        totalCo2SavedKg={overview?.totalCo2SavedKg}
        className="stats-card"
      />
    </div>
  );
}
