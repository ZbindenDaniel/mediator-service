import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreateItemCard from './CreateItemCard';
import SearchCard from './SearchCard';
import StatsCard from './StatsCard';
import RecentBoxesCard from './RecentBoxesCard';
import RecentEventsCard from './RecentEventsCard';
import ImportCard from './ImportCard';
import LoadingPage from './LoadingPage';
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
  const [health, setHealth] = useState('');
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isHealthLoading, setIsHealthLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/overview');
        const d = await r.json();
        setOverview(d);
        console.log('Loaded overview');
      } catch (err) {
        console.error('Failed to load overview', err);
      } finally {
        setIsOverviewLoading(false);
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
      } finally {
        setIsHealthLoading(false);
      }
    })();
  }, []);

  if (isOverviewLoading || isHealthLoading) {
    return (
      <LoadingPage message="Übersicht wird geladen…">
        <p className="muted">Aktuelle Kennzahlen und Dienststatus folgen in Kürze.</p>
      </LoadingPage>
    );
  }

  return (
    <div className="container overview">
      <h1>Übersicht</h1>
      <div className="grid landing-grid">
        <CreateItemCard />
        <SearchCard />
        <div className="card">
          <Link to="/scan" className="linkcard">
            <h3>QR-Scanner</h3>
            <p className="muted">Sollte der Scanner nicht laden, öffne <a href="/scan" target="_blank" rel="noopener">/scan</a> in einem neuen Tab.</p>
          </Link>
        </div>
        <StatsCard counts={overview?.counts} health={health} />
        <RecentBoxesCard boxes={overview?.recentBoxes || []} />
        <RecentEventsCard events={overview?.recentEvents || []} />
        <ImportCard />
      </div>
    </div>
  );
}
