import React from 'react';

interface Counts {
  boxes: number;
  items: number;
  itemsNoWms: number;
}

interface Props {
  counts?: Counts;
  printerOk: boolean | null;
  health: string;
}

export default function StatsCard({ counts, printerOk, health }: Props) {
  return (
    <div className="card">
      <h2>Statistiken</h2>
      {counts ? (
        <div id="stats" className="list">
          <div>Boxen gesamt <b>{counts.boxes}</b></div>
          <div>Artikel gesamt: <b>{counts.items}</b></div>
          <div>Artikel ohne WMS-Link: <b>{counts.itemsNoWms}</b></div>
        </div>
      ) : (
        <div className="muted">Übersicht konnte nicht geladen werden</div>
      )}
      <div className="muted">
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
      </div>
      <div className="muted">Status: <span>{health}</span></div>
    </div>
  );
}
