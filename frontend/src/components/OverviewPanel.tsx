import React, { useEffect, useState } from 'react';
import StatsCard from './StatsCard';
import { useFeatures } from '../context/FeaturesContext';

interface OverviewData {
  counts?: { boxes: number; items: number; itemsNoBox: number };
  agentic?: { stateCounts?: Record<string, number>; enrichedItems?: number };
  totalWeightKg?: number;
  totalPriceValue?: number;
  co2LabelCounts?: Partial<Record<string, number>>;
  co2ScoreSums?: Partial<Record<string, number>>;
}

export default function OverviewPanel() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [printerReason, setPrinterReason] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('unknown');
  const features = useFeatures();

  useEffect(() => {
    let cancelled = false;

    fetch('/api/overview')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch((err) => console.warn('OverviewPanel: failed to load overview', err));

    // The printer API is blocked (404) when printing is off; don't ask.
    if (features.printing) {
      fetch('/api/printer/status')
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setPrinterOk(data?.ok ?? null);
          setPrinterReason(data?.reason ?? null);
        })
        .catch(() => {});
    }

    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setHealth(data?.ok === true ? 'ok' : 'error'); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [features.printing]);

  return (
    <StatsCard
      counts={overview?.counts}
      agentic={features.agentic ? overview?.agentic as any : undefined}
      totalWeightKg={overview?.totalWeightKg}
      totalPriceValue={overview?.totalPriceValue}
      co2LabelCounts={overview?.co2LabelCounts as any}
      co2ScoreSums={overview?.co2ScoreSums as any}
      printerOk={printerOk}
      printerReason={printerReason}
      health={health}
      className="stats-card"
    />
  );
}
