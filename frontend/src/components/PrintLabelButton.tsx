import React from 'react';

interface Props {
  boxId?: string;
  itemId?: string;
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const targetId = boxId ?? itemId ?? '';
  const type = boxId ? 'box' : itemId ? 'item' : '';
  const href = targetId && type ? `/print?type=${type}&id=${encodeURIComponent(targetId)}` : '';

  if (!href && (boxId || itemId)) {
    console.warn('Print label link disabled: missing identifier', { boxId, itemId });
  }

  return (
    <div className="card linkcard">
      {href ? (
        <a className="linkcard" href={href} target="_blank" rel="noopener">
          <h3>Label drucken</h3>
        </a>
      ) : (
        <div className="linkcard" aria-disabled="true">
          <h3>Label drucken</h3>
          <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#64748b' }}>
            Keine ID verfügbar.
          </p>
        </div>
      )}
    </div>
  );
}
