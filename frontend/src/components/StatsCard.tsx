import React from 'react';

interface Counts {
  boxes: number;
  items: number;
  itemsNoBox: number;
}

interface Props {
  counts?: Counts;
  printerOk: boolean | null;
  printerReason?: string | null;
  health: string;
  className?: string;
}

// TODO(overview-inline-create): Verify compact stats card sizing at wide breakpoints.
export default function StatsCard({ counts, printerOk, printerReason, health, className }: Props) {
  const classes = ['card', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
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
      <div className="muted status-info">
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
        {printerReason ? (
          <span className="muted" style={{ marginLeft: 8 }}>
            {printerReason}
          </span>
        ) : null}
      </div>
      <div className="muted status-info">Ki: 
         <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: health == null ? '#999' : health === 'ok' ? '#1cbc2c' : '#d22'
          }}
        ></span>
      </div>
    </div>
  );
}
