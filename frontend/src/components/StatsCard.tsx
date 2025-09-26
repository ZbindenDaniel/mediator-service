import React from 'react';

interface Counts {
  boxes: number;
  items: number;
  itemsNoBox: number;
}

interface Props {
  counts?: Counts;
  health: string;
}

export default function StatsCard({ counts, health }: Props) {
  return (
    <div className="card">
      <h2>Statistiken</h2>
      {counts ? (
        <div id="stats" className="list">
          <div>Behälter gesamt <b>{counts.boxes}</b></div>
          <div>Artikel gesamt: <b>{counts.items}</b></div>
          <div>Artikel ohne Behälter: <b>{counts.itemsNoBox}</b></div>
        </div>
      ) : (
        <div className="muted">Übersicht konnte nicht geladen werden</div>
      )}
      <div className="muted">Status: <span>{health}</span></div>
    </div>
  );
}
