import React, { useEffect, useState } from 'react';
import RecentBoxesCard from './RecentBoxesCard';
import RecentEventsCard from './RecentEventsCard';
import LoadingPage from './LoadingPage';
import type { Box, EventLog } from '../../../models';
import { filterVisibleEvents } from '../utils/eventLogTopics';

export default function LandingPage() {
  const [recentBoxes, setRecentBoxes] = useState<Box[]>([]);
  const [previewEvents, setPreviewEvents] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/overview');
        const d = await r.json();
        setRecentBoxes(Array.isArray(d?.recentBoxes) ? d.recentBoxes : []);
        if (Array.isArray(d?.recentEvents)) {
          setPreviewEvents(filterVisibleEvents(d.recentEvents).slice(0, 3));
        }
      } catch (err) {
        console.error('Failed to load overview', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return <LoadingPage message="Übersicht wird geladen…" />;
  }

  return (
    <div className="container overview">
      <RecentBoxesCard boxes={recentBoxes} />
      <RecentEventsCard events={previewEvents} />
    </div>
  );
}
