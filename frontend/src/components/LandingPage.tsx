import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreateItemCard from './CreateItemCard';
import SearchCard from './SearchCard';
import StatsCard from './StatsCard';
import RecentBoxesCard from './RecentBoxesCard';
import RecentEventsCard, { RecentEventsList } from './RecentEventsCard';
import ImportCard from './ImportCard';
import LoadingPage from './LoadingPage';
import type { Box, EventLog } from '../../../models';
import { filterAllowedEvents } from '../utils/eventLogLevels';

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
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isHealthLoading, setIsHealthLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/overview');
        const d = await r.json();
        setOverview(d);
        if (Array.isArray(d?.recentEvents)) {
          const filtered = filterAllowedEvents(d.recentEvents);
          const limited = filtered.slice(0, 3);
          if (filtered.length > 3) {
            console.info('Truncating overview events to preview limit', { total: filtered.length });
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
        {/* <p className="muted">Aktuelle Kennzahlen und Dienststatus folgen in Kürze.</p> */}
      </LoadingPage>
    );
  }

  return (
    <div className="container overview">
      <h1>Übersicht</h1>
      <div className="grid landing-grid">
        <CreateItemCard />
        <SearchCard />
     {/* 
        <div className="card" id="qr-scan-card">
          <Link className="linkcard" to="/scan">
            <div>
              <h2>QR-Scanner</h2>
              <p className="muted">QR-Codes von Behältern scannen und Details sofort anzeigen</p>
            </div>
          </Link>
        </div>
        <div className="card" id="chat-card">
          <Link className="linkcard" to="/chat">
            <div>
              <h2>Chat</h2>
              <p className="muted">Mit dem Agenten sprechen und vorgeschlagene SQLite-Queries ansehen</p>
            </div>
          </Link>
        </div>
              */}
        <StatsCard counts={overview?.counts} printerOk={printerOk} health={health} />
        <RecentBoxesCard boxes={overview?.recentBoxes || []} />
        <RecentEventsCard events={previewEvents}></RecentEventsCard>
        <ImportCard />
      </div>
    </div>
  );
}
