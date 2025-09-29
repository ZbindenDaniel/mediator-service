import type { BoxLabelPayload, ItemLabelPayload } from '../../../models';

export interface PrintLabelOptions {
  win?: Window & typeof globalThis;
  logger?: Pick<typeof console, 'error' | 'warn'>;
  title?: string;
  autoPrint?: boolean;
}

export interface PrintLabelResult {
  success: boolean;
  status: string;
}

type LabelPayload = BoxLabelPayload | ItemLabelPayload;

function isBoxPayload(payload: LabelPayload): payload is BoxLabelPayload {
  return (payload as BoxLabelPayload).notes !== undefined;
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLabelHtml(payload: LabelPayload, options?: PrintLabelOptions): string {
  const isBox = isBoxPayload(payload);
  const title = options?.title ?? (isBox ? 'Behälter-Etikett' : 'Artikel-Etikett');
  const header = isBox ? 'Behälter' : 'Artikel';
  const details = isBox
    ? [
        ['Standort', payload.location ?? '–'],
        ['Notizen', payload.notes ?? '–'],
        ['Abgestellt von', payload.placedBy ?? '–'],
        ['Abgestellt am', payload.placedAt ?? '–']
      ]
    : [
        ['Artikelnummer', payload.articleNumber ?? '–'],
        ['Behälter', payload.boxId ?? '–'],
        ['Standort', payload.location ?? '–']
      ];

  const payloadScript = JSON.stringify(payload).replace(/</g, '\\u003c');
  const autoPrint = options?.autoPrint ?? true;

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: only light; }
      body {
        margin: 0;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        background: #f5f6f8;
        padding: 24px;
      }
      .label {
        background: #fff;
        margin: 0 auto;
        padding: 18px 22px;
        max-width: 640px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        display: grid;
        grid-template-columns: 1fr 170px;
        gap: 18px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      .meta {
        font-size: 14px;
        color: #4b5563;
        margin-bottom: 12px;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 12px;
        font-size: 14px;
      }
      dt {
        font-weight: 600;
      }
      dd {
        margin: 0;
        color: #111827;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .qr {
        display: flex;
        justify-content: center;
        align-items: center;
        background: #f1f5f9;
        border-radius: 12px;
        padding: 12px;
      }
      .qr img,
      .qr canvas {
        width: 148px;
        height: 148px;
        image-rendering: pixelated;
      }
      .qr canvas { display: none; }
      .qr[data-has-image="false"] img { display: none; }
      .qr[data-has-image="false"] canvas { display: block; }
      .footer {
        margin-top: 12px;
        font-size: 12px;
        color: #6b7280;
        text-align: right;
      }
    </style>
  </head>
  <body>
    <div class="label">
      <div>
        <h1>${escapeHtml(header)} ${escapeHtml(payload.id)}</h1>
        <div class="meta">${escapeHtml(new Date().toLocaleString('de-DE'))}</div>
        <dl>
          ${details
            .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
            .join('')}
        </dl>
        <div class="footer">Bitte den Druckdialog Ihres Browsers verwenden.</div>
      </div>
      <div class="qr" data-has-image="${payload.qrDataUri ? 'true' : 'false'}">
        <img id="qr-image" alt="QR-Code" src="${payload.qrDataUri ?? ''}" />
        <canvas id="qr-canvas" width="160" height="160" aria-label="QR-Code"></canvas>
      </div>
    </div>
    <script>
      const payload = ${payloadScript};
      const autoPrint = ${autoPrint ? 'true' : 'false'};
      const qrWrapper = document.querySelector('.qr');
      const img = document.getElementById('qr-image');
      const canvas = document.getElementById('qr-canvas');
      if (!payload.qrDataUri && payload.qrModules && Array.isArray(payload.qrModules) && canvas && qrWrapper) {
        try {
          const scale = Math.max(2, Math.floor(140 / payload.qrModules.length));
          const margin = Number(payload.qrMargin || 0);
          const size = payload.qrModules.length + margin * 2;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('2d context unavailable');
          }
          canvas.width = canvas.height = size * scale;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000';
          for (let y = 0; y < payload.qrModules.length; y++) {
            for (let x = 0; x < payload.qrModules[y].length; x++) {
              if (payload.qrModules[y][x]) {
                ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
              }
            }
          }
          qrWrapper.setAttribute('data-has-image', 'false');
        } catch (err) {
          console.error('QR canvas rendering failed', err);
          if (canvas) {
            canvas.replaceWith(document.createTextNode('QR-Code nicht verfügbar.'));
          }
        }
      } else if (!payload.qrDataUri && img) {
        img.replaceWith(document.createTextNode('QR-Code nicht verfügbar.'));
      }
      if (autoPrint) {
        window.addEventListener('load', () => {
          setTimeout(() => {
            try {
              window.print();
            } catch (err) {
              console.warn('Automatischer Druck fehlgeschlagen', err);
            }
          }, 250);
        });
      }
    </script>
  </body>
</html>`;
}

export function openPrintLabel(payload: LabelPayload, options?: PrintLabelOptions): PrintLabelResult {
  const fallbackWindow = typeof window !== 'undefined' ? window : undefined;
  const win = options?.win ?? fallbackWindow;
  if (!win) {
    throw new Error('No window context available for printing');
  }

  const logger = options?.logger ?? console;
  let popup: Window | null = null;
  try {
    popup = win.open('', '_blank', 'noopener,width=900,height=700');
  } catch (openErr) {
    logger.error('Failed to open print window', openErr);
    popup = null;
  }

  if (!popup) {
    return {
      success: false,
      status: 'Pop-ups blockiert? Bitte erlauben, um Etikett zu öffnen.'
    };
  }

  try {
    const html = buildLabelHtml(payload, options);
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch (renderErr) {
    logger.error('Failed to render print label window', renderErr);
    try {
      popup.close();
    } catch (closeErr) {
      logger.warn('Failed to close incomplete print window', closeErr);
    }
    return {
      success: false,
      status: 'Fehler beim Vorbereiten des Etiketts.'
    };
  }

  try {
    popup.focus();
  } catch (focusErr) {
    logger.warn('Unable to focus print window', focusErr);
  }

  return {
    success: true,
    status: 'Vorlage geöffnet. Bitte Druckdialog nutzen.'
  };
}
