import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../lib/user';

interface Props {
  boxId?: string;
  itemId?: string;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  try {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  } catch (err) {
    console.error('Failed to convert base64 to Blob', err);
    throw err;
  }
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const [status, setStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('etikett.pdf');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!boxId && !itemId) {
      setStatus('Keine ID angegeben.');
      return;
    }
    try {
      setStatus('Lade Etikett…');
      const actor = getUser().trim();
      if (!actor) {
        console.warn('Print aborted: no actor available for request', { boxId, itemId });
        setStatus('Kein Benutzername hinterlegt. Bitte im Kopfbereich doppelklicken, um ihn zu setzen.');
        return;
      }
      const url = boxId
        ? `/api/print/box/${encodeURIComponent(boxId)}`
        : `/api/print/item/${encodeURIComponent(itemId || '')}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (typeof data.pdfBase64 !== 'string' || !data.pdfBase64.trim()) {
        throw new Error('Antwort ohne PDF erhalten.');
      }

      const sanitizedFileName = typeof data.fileName === 'string' && data.fileName.trim()
        ? data.fileName.trim()
        : boxId
        ? `box-${boxId}.pdf`
        : itemId
        ? `item-${itemId}.pdf`
        : 'etikett.pdf';

      let blob: Blob;
      try {
        blob = base64ToBlob(data.pdfBase64.trim(), 'application/pdf');
      } catch (blobErr) {
        throw new Error('PDF konnte nicht erstellt werden.');
      }

      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
      setFileName(sanitizedFileName);

      const popup = window.open(url, '_blank', 'noopener');
      if (!popup) {
        console.warn('PDF window blocked, providing manual link instead', {
          boxId,
          itemId,
        });
        setStatus('PDF erstellt. Bitte Pop-up erlauben oder Link verwenden.');
        return;
      }
      setStatus('PDF geöffnet.');
      try {
        popup.focus();
      } catch (focusErr) {
        console.warn('Unable to focus PDF window', focusErr);
      }
      console.info('Label PDF generated and opened', {
        boxId,
        itemId,
        fileName: sanitizedFileName,
      });
    } catch (err) {
      console.error('Print failed', err);
      const message = err instanceof Error ? err.message : 'unbekannter Fehler';
      setStatus(`Fehler: ${message}`);
      setPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return '';
      });
    }
  }

  return (
    <div>
      <div className="card linkcard">
        <Link className="linkcard" onClick={handleClick} to="">
          <h3>Label drucken</h3>
        </Link>
        {status && (
          <div>
            {status}
            {previewUrl && (
              <>
                {' '}
                –{' '}
                <a
                  className="mono"
                  href={previewUrl}
                  target="_blank"
                  rel="noopener"
                  download={fileName}
                >
                  PDF öffnen
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
