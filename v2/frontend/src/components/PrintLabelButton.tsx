import React, { useState } from 'react';

interface Props {
  boxId?: string;
  itemId?: string;
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  async function handleClick() {
    try {
      setStatus('Printing...');
      const url = boxId
        ? `/api/print/box/${encodeURIComponent(boxId)}`
        : `/api/print/item/${encodeURIComponent(itemId || '')}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPreview(data.previewUrl || '');
        setStatus(data.sent ? 'Gesendet an Drucker' : 'Vorschau bereit');
      } else {
        setStatus('Error: ' + (data.error || res.status));
      }
    } catch (err) {
      console.error('Print failed', err);
      setStatus('Print failed');
    }
  }

  return (
    <div>
      <button className="btn" onClick={handleClick}>Print Label</button>
      {status && <div>{status}{preview && (
        <> – <a className="mono" href={preview} target="_blank" rel="noopener">PDF</a></>
      )}</div>}
    </div>
  );
}
