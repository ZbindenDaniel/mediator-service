import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreateItemCard from './CreateItemCard';
import SearchCard from './SearchCard';
import StatsCard from './StatsCard';
import RecentBoxesCard from './RecentBoxesCard';
import { RecentEventsList } from './RecentEventsCard';
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
  const [previewEvents, setPreviewEvents] = useState<EventLog[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/overview');
        const d = await r.json();
        setOverview(d);
        if (Array.isArray(d?.recentEvents)) {
          const limited = d.recentEvents.slice(0, 3);
          if (d.recentEvents.length > 3) {
            console.info('Truncating overview events to preview limit', { total: d.recentEvents.length });
          }
          setPreviewEvents(limited);
        } else {
          setPreviewEvents([]);
        }
        console.log('Loaded overview');
      } catch (err) {
        console.error('Failed to load overview', err);
        setPreviewEvents([]);
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
        <div className="card" id="qr-scan-card">
          <Link className="linkcard" to="/scan">
            <div>
              <h2>QR-Scanner</h2>
              <p className="muted">QR-Codes von Behältern scannen und Details sofort anzeigen</p>
            </div>
          </Link>
        </div>
        <StatsCard counts={overview?.counts} printerOk={printerOk} health={health} />
        <RecentBoxesCard boxes={overview?.recentBoxes || []} />
        <div className="card recent-activities-preview" aria-labelledby="recent-activities-heading">
          <div className="card-header">
            <h2 id="recent-activities-heading">Letzte Aktivitäten</h2>
            <Link to="/activities" className="muted" aria-label="Alle Aktivitäten anzeigen">
              Alle Aktivitäten
            </Link>
          </div>
          <RecentEventsList events={previewEvents} />
        </div>
        <ImportCard />
      </div>
    </div>
  );
}
