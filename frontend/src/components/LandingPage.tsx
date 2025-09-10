import React, { useEffect, useState } from 'react';
import CreateItemCard from './CreateItemCard';
import SearchCard from './SearchCard';
import StatsCard from './StatsCard';
import RecentBoxesCard from './RecentBoxesCard';
import RecentEventsCard from './RecentEventsCard';
import ImportCard from './ImportCard';
import type { Box, EventLog } from '../../../models';

interface OverviewCounts {
  boxes: number;
  items: number;
  itemsNoBox: number;
}

interface OverviewData {
  counts: OverviewCounts;
  recentBoxes: Box[];
  recentEvents: EventLog[];
}

export default function LandingPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [health, setHealth] = useState('prüfe…');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/overview');
        const d = await r.json();
        setOverview(d);
        console.log('Loaded overview');
      } catch (err) {
        console.error('Failed to load overview', err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/printer/status');
        const j = await r.json();
        setPrinterOk(r.ok && j.ok);
        console.log('Checked printer status');
      } catch (err) {
        console.error('Printer status fetch failed', err);
        setPrinterOk(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/health');
        const j = await r.json();
        setHealth(r.ok && j.ok ? 'ok' : (j.reason || 'nicht erreichbar'));
        console.log('Checked service health');
      } catch (err) {
        console.error('Health check failed', err);
        setHealth('nicht erreichbar');
      }
    })();
  }, []);

  return (
    <div className="container overview">
      <h1>Übersicht</h1>
      <div className="grid landing-grid">
        <CreateItemCard />
        <SearchCard />
        <StatsCard counts={overview?.counts} printerOk={printerOk} health={health} />
        <RecentBoxesCard boxes={overview?.recentBoxes || []} />
        <RecentEventsCard events={overview?.recentEvents || []} />
        <ImportCard />
      </div>
    </div>
  );
}
