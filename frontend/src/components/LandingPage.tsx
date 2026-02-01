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
import { filterVisibleEvents } from '../utils/eventLogTopics';

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

interface PrinterStatusResponse {
  ok?: boolean;
  reason?: string;
}

export default function LandingPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [printerReason, setPrinterReason] = useState<string | null>(null);
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
          const filtered = filterVisibleEvents(d.recentEvents);
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
        const j = (await r.json()) as PrinterStatusResponse;
        const resolvedOk = r.ok && j.ok === true;
        setPrinterOk(resolvedOk);
        setPrinterReason(resolvedOk ? null : j?.reason ?? null);
        if (!resolvedOk) {
          console.warn('Printer status unhealthy', { reason: j?.reason });
        } else {
          console.log('Checked printer status');
        }
      } catch (err) {
        console.error('Printer status fetch failed', err);
        setPrinterOk(false);
        setPrinterReason(null);
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
        {/* TODO(overview-layout): Reconfirm stats placement after Erfassen card order update. */}
        <CreateItemCard />
        <SearchCard />
        <StatsCard
          counts={overview?.counts}
          printerOk={printerOk}
          printerReason={printerReason}
          health={health}
          className="stats-card"
        />
        {/* TODO(qr-scan-card): Reconfirm placement once HTTPS QR scanning is verified in production. */}
        {/*
          <div className="card" id="qr-scan-card">
            <Link className="linkcard" to="/scan">
              <div>
                <h2>QR-Scanner</h2>
                <p className="muted">QR-Codes von Behältern scannen und Details sofort anzeigen</p>
              </div>
            </Link>
          </div>
        */}
        {/* TODO(chat-card): Confirm that chat entry should stay visible alongside overview cards. */}
        <div className="card" id="chat-card">
          <Link className="linkcard" to="/chat">
            <div>
              <h2>Chat</h2>
              <p className="muted">Mit dem Agenten sprechen und vorgeschlagene SQLite-Queries ansehen</p>
            </div>
          </Link>
        </div>
        <RecentBoxesCard boxes={overview?.recentBoxes || []} />
        <div className="grid-span-2">
          <RecentEventsCard events={previewEvents}></RecentEventsCard>
        </div>
        <ImportCard />
      </div>
    </div>
  );
}
